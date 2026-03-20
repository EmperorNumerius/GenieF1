import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel
import stripe

# Load environment before importing modules that read env at import time.
load_dotenv()

import livef1_client
from simulation import predict_ers_impact, predict_pit_stop, predict_yellow_flag_impact

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_dummy")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "whsec_dummy")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "dummy_groq_key")
groq_client = Groq(api_key=GROQ_API_KEY)

logger = logging.getLogger(__name__)

# In-memory
unlocked_sessions = set()
cached_state: Dict[str, Any] = {
    "cars": [],
    "session": None,
    "weather": None,
    "race_control": [],
    "updated_at": None,
    "error": "Booting GenieF1 telemetry service...",
}

# LiveF1 data store — populated by the SignalR background thread
data_store = livef1_client.LiveF1DataStore()
_livef1_thread = None


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def refresh_cached_state() -> None:
    """Read from the LiveF1 data store and update the global cached_state."""
    global cached_state

    state = livef1_client.get_full_race_state(data_store)
    session_info = livef1_client.get_session_info(data_store)

    snap = data_store.snapshot()
    state["session"] = session_info
    state["api_status"] = livef1_client.get_api_status(data_store)
    state["stale"] = bool(state.get("error"))
    state["track_outline"] = snap.get("track_outline", [])
    state["position_trails"] = snap.get("position_history", {})

    # Mark if showing historical data
    if livef1_client.is_historical_mode():
        state["historical"] = True
        state.pop("error", None)

    cached_state = state


async def state_refresh_loop() -> None:
    """Background loop that refreshes cached_state from the data store."""
    # Give the livef1 client a moment to connect
    await asyncio.sleep(3)

    # If no live data after initial wait, load the last completed session
    snap = data_store.snapshot()
    if not snap["drivers"] and not snap["car_data"]:
        logger.info("No live session detected — loading most recent historical session...")
        await asyncio.get_event_loop().run_in_executor(
            None, livef1_client.load_latest_historical_session, data_store
        )

    while True:
        try:
            await refresh_cached_state()
        except Exception as exc:
            logger.warning("Error refreshing state: %s", exc)

        # Refresh every 2 seconds to keep the WebSocket feed fresh
        await asyncio.sleep(2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _livef1_thread

    # Start the livef1 SignalR client in a daemon thread
    _livef1_thread = livef1_client.start_livef1_thread(data_store)

    # Start the state refresh loop
    refresh_task = asyncio.create_task(state_refresh_loop())

    yield

    # Cleanup
    refresh_task.cancel()
    logger.info("GenieF1 shutting down.")


app = FastAPI(title="GenieF1 - Live Race Engineer Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws/race_data")
async def websocket_race_data(websocket: WebSocket):
    """Stream live race data to the frontend."""
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(cached_state)
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass


@app.get("/api/race_state")
async def get_race_state():
    """Get current race state as a one-shot snapshot."""
    return cached_state


@app.get("/api/telemetry")
async def get_telemetry(driver: Optional[str] = None, driver_number: Optional[int] = None):
    """Backward-compatible telemetry endpoint with optional driver filter."""
    if not driver and driver_number is None:
        return cached_state

    cars = cached_state.get("cars", [])
    selected = None

    if driver_number is not None:
        for car in cars:
            if car.get("number") == driver_number:
                selected = car
                break

    if selected is None and driver:
        needle = driver.strip().casefold()
        for car in cars:
            if (
                needle == str(car.get("id", "")).casefold()
                or needle in str(car.get("name", "")).casefold()
            ):
                selected = car
                break

    if selected is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    return {
        "session": cached_state.get("session"),
        "updated_at": cached_state.get("updated_at"),
        "car": selected,
        "error": cached_state.get("error"),
    }


@app.get("/api/session")
async def get_session():
    """Get resolved session info and API status."""
    return {
        "session": cached_state.get("session"),
        "api_status": livef1_client.get_api_status(data_store),
        "error": cached_state.get("error"),
    }


@app.get("/api/status")
async def get_status():
    """Service health/status endpoint for debugging."""
    api_status = livef1_client.get_api_status(data_store)
    return {
        "api_status": api_status,
        "cached_state_updated_at": cached_state.get("updated_at"),
        "cached_state_error": cached_state.get("error"),
        "car_count": len(cached_state.get("cars", [])),
        "data_source": "livef1 (SignalR)",
    }


@app.post("/api/session/refresh")
async def refresh_now():
    """Force an immediate state refresh from the data store."""
    await refresh_cached_state()
    return {
        "ok": bool(cached_state.get("cars")),
        "session": cached_state.get("session"),
        "error": cached_state.get("error"),
        "api_status": livef1_client.get_api_status(data_store),
    }


@app.get("/api/calendar")
async def get_calendar(year: int = 2026):
    """Get all race meetings for a given year."""
    meetings = livef1_client.get_meetings_for_year(year)
    if not meetings:
        meetings = livef1_client.get_meetings_for_year(year - 1)
    return {"year": year, "meetings": meetings or []}


def check_session_unlocked(session_id: Optional[str] = Header(None)):
    if not session_id or session_id not in unlocked_sessions:
        raise HTTPException(status_code=403, detail="AI insights locked. Please unlock.")
    return session_id


@app.get("/api/insights")
async def get_ai_insights(session_id: str = Depends(check_session_unlocked)):
    """AI race engineer insight based on live data."""
    cars = cached_state.get("cars", [])
    session_info = cached_state.get("session", {})

    if not cars:
        return {"insight": "No live data available for analysis."}

    leader = cars[0] if cars else {}
    prompt = (
        f"You are an F1 race engineer. The current session is {session_info.get('meeting_name', 'unknown')} "
        f"({session_info.get('type', 'Race')}). "
        f"The leader is {leader.get('name', 'unknown')} (P1) on {leader.get('tire', 'unknown')} tires. "
        "Provide ONE concise, dramatic broadcast-style insight about the current race situation."
    )

    try:
        resp = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional Formula 1 race commentator and engineer.",
                },
                {"role": "user", "content": prompt},
            ],
            model="llama3-8b-8192",
            temperature=0.7,
            max_tokens=80,
        )
        return {"insight": resp.choices[0].message.content}
    except Exception as exc:
        logger.error("Groq error: %s", exc)
        return {
            "insight": f"{leader.get('name', 'The leader')} is setting a blistering pace, but tire degradation is starting to bite."
        }


@app.get("/api/pit_projection")
async def get_pit_projection(driver_number: int, session_id: str = Depends(check_session_unlocked)):
    """Predict where a driver will re-enter after a pit stop."""
    cars = cached_state.get("cars", [])
    target = None
    for car in cars:
        if car.get("number") == driver_number:
            target = car
            break

    if not target:
        return {"error": "Driver not found"}

    result = predict_pit_stop(
        driver_pos=target.get("pos", 1),
        driver_interval=None,
        all_cars=cars,
    )

    prompt = (
        f"You are an F1 race engineer. {target.get('name')} is currently P{target.get('pos')}. "
        f"If they pit now, they'll lose ~22 seconds and rejoin in P{result['predicted_position']}. "
        "Give a one-sentence radio message to the driver about this strategy call."
    )

    try:
        resp = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a Formula 1 race engineer speaking to your driver on the radio.",
                },
                {"role": "user", "content": prompt},
            ],
            model="llama3-8b-8192",
            temperature=0.7,
            max_tokens=60,
        )
        result["insight"] = resp.choices[0].message.content
    except Exception:
        result["insight"] = f"Copy {target.get('name', 'driver')}, box now for P{result['predicted_position']} rejoin."

    return result


@app.get("/api/yellow_flag_analysis")
async def get_yellow_flag_analysis(session_id: str = Depends(check_session_unlocked)):
    """Predict what would happen if a yellow flag/safety car is thrown."""
    cars = cached_state.get("cars", [])
    return predict_yellow_flag_impact(cars)


@app.get("/api/ers_prediction")
async def get_ers_prediction(
    driver_number: int,
    laps_remaining: int = 20,
    session_id: str = Depends(check_session_unlocked),
):
    """Predict ERS battery impact for the rest of the race."""
    return predict_ers_impact(str(driver_number), ers_level=70, laps_remaining=laps_remaining)


@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        sid = event["data"]["object"].get("client_reference_id")
        if sid:
            unlocked_sessions.add(sid)

    return {"status": "success"}


@app.post("/api/unlock_dev")
async def unlock_session_dev(session_id: str):
    # Security: Prevent authorization bypass in production
    if os.getenv("ENVIRONMENT", "").lower() == "production":
        raise HTTPException(status_code=403, detail="Not available in production")
    unlocked_sessions.add(session_id)
    return {"status": f"Unlocked session {session_id}"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0")
