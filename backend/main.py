import os
import asyncio
import json
import logging
from typing import Optional, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Header, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from dotenv import load_dotenv
import stripe

import openf1_client as openf1
from simulation import predict_pit_stop, predict_yellow_flag_impact, predict_ers_impact

load_dotenv()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_dummy")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "whsec_dummy")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "dummy_groq_key")
groq_client = Groq(api_key=GROQ_API_KEY)

# In-memory
unlocked_sessions = set()
cached_state = {"cars": [], "session": None, "weather": None, "race_control": []}
current_session_key = None

logger = logging.getLogger(__name__)


async def poll_openf1():
    """Background task: poll OpenF1 API for the latest session and race data."""
    global cached_state, current_session_key

    while True:
        try:
            # Find the latest session
            session = await openf1.get_latest_session()
            if session:
                sk = session.get("session_key")
                current_session_key = sk

                # Fetch full race state
                state = await openf1.get_full_race_state(str(sk))
                state["session"] = {
                    "key": sk,
                    "name": session.get("session_name", ""),
                    "type": session.get("session_type", ""),
                    "circuit": session.get("circuit_short_name", ""),
                    "country": session.get("country_name", ""),
                    "meeting_name": session.get("meeting_name", ""),
                    "status": session.get("status", ""),
                    "year": session.get("year", 2026),
                }
                cached_state = state
            else:
                logger.warning("No session found from OpenF1 API")
        except Exception as e:
            logger.warning(f"Error polling OpenF1: {e}")

        await asyncio.sleep(10)  # Poll every 10s; per-endpoint caching handles freshness


@asynccontextmanager
async def lifespan(app: FastAPI):
    poll_task = asyncio.create_task(poll_openf1())
    yield
    poll_task.cancel()


app = FastAPI(title="GenieF1 — Live Race Engineer Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──── WebSocket: Live Race Data ────

@app.websocket("/ws/race_data")
async def websocket_race_data(websocket: WebSocket):
    """Stream live race data to the frontend."""
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(cached_state)
            await asyncio.sleep(2)  # Send every 2 seconds
    except WebSocketDisconnect:
        pass


# ──── REST: Race Data ────

@app.get("/api/race_state")
async def get_race_state():
    """Get the current race state (same data as WebSocket, for one-shot requests)."""
    return cached_state


@app.get("/api/session")
async def get_session():
    """Get info about the current/latest session."""
    return cached_state.get("session", {"error": "No session loaded"})


@app.get("/api/calendar")
async def get_calendar(year: int = 2026):
    """Get all race meetings for a year."""
    meetings = await openf1.get_meetings(year)
    if not meetings:
        # Fallback to previous year
        meetings = await openf1.get_meetings(year - 1)
    return {"year": year, "meetings": meetings or []}


# ──── Premium: AI Strategy (Paywall) ────

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
        f"({session_info.get('session_type', 'Race')}). "
        f"The leader is {leader.get('name', 'unknown')} (P1) on {leader.get('tire', 'unknown')} tires. "
        f"Provide ONE concise, dramatic broadcast-style insight about the current race situation."
    )

    try:
        resp = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a professional Formula 1 race commentator and engineer."},
                {"role": "user", "content": prompt}
            ],
            model="llama3-8b-8192",
            temperature=0.7,
            max_tokens=80,
        )
        return {"insight": resp.choices[0].message.content}
    except Exception as e:
        logger.error(f"Groq error: {e}")
        return {"insight": f"{leader.get('name', 'The leader')} is setting a blistering pace, but tire degradation is starting to bite."}


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

    # Get AI commentary
    prompt = (
        f"You are an F1 race engineer. {target.get('name')} is currently P{target.get('pos')}. "
        f"If they pit now, they'll lose ~22 seconds and rejoin in P{result['predicted_position']}. "
        f"Give a one-sentence radio message to the driver about this strategy call."
    )

    try:
        resp = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a Formula 1 race engineer speaking to your driver on the radio."},
                {"role": "user", "content": prompt}
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
async def get_ers_prediction(driver_number: int, laps_remaining: int = 20, session_id: str = Depends(check_session_unlocked)):
    """Predict ERS battery impact for the rest of the race."""
    return predict_ers_impact(str(driver_number), ers_level=70, laps_remaining=laps_remaining)


# ──── Stripe & Auth ────

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
