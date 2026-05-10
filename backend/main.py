import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any

import stripe
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings

from livef1_client import live_manager, data_store, RaceState, CarState

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    environment: str = "development"
    stripe_secret_key: str = "sk_test_dummy"
    stripe_webhook_secret: str = "whsec_dummy"

    class Config:
        env_file = ".env"

settings = Settings()
stripe.api_key = settings.stripe_secret_key

# In-memory store for unlocked sessions
unlocked_sessions: set[str] = set()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting LiveF1 Connection Manager...")
    await live_manager.start()
    yield
    # Shutdown
    logger.info("Shutting down LiveF1 Connection Manager...")
    await live_manager.stop()

app = FastAPI(title="GenieF1 Backend", lifespan=lifespan)

origins = [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_session(request: Request) -> str:
    session_id = request.headers.get("session-id")
    if not session_id or session_id not in unlocked_sessions:
        raise HTTPException(status_code=403, detail="Session not unlocked or invalid")
    return session_id

from fastapi import WebSocket, WebSocketDisconnect

class StatusResponse(BaseModel):
    status: str
    is_connected: bool
    last_update: str
    cars_tracked: int

@app.get("/api/status", response_model=StatusResponse)
async def get_status():
    async with data_store.lock:
        return StatusResponse(
            status="ok",
            is_connected=data_store.is_connected,
            last_update=data_store.last_update.isoformat(),
            cars_tracked=len(data_store.cars_dict)
        )

@app.get("/api/race_state", response_model=RaceState)
async def get_race_state():
    return await data_store.get_state()

@app.get("/api/telemetry", response_model=CarState)
async def get_telemetry(driver_number: str):
    async with data_store.lock:
        if driver_number not in data_store.cars_dict:
            raise HTTPException(status_code=404, detail="Driver not found")
        return data_store.cars_dict[driver_number]

class SessionResponse(BaseModel):
    session_name: str
    session_type: str
    livef1_connected: bool

@app.get("/api/session", response_model=SessionResponse)
async def get_session():
    state = await data_store.get_state()
    async with data_store.lock:
        return SessionResponse(
            session_name=state.session_name,
            session_type=state.session_type,
            livef1_connected=data_store.is_connected
        )

class RefreshResponse(BaseModel):
    status: str

@app.post("/api/session/refresh", response_model=RefreshResponse)
async def post_refresh():
    await live_manager.stop()
    await asyncio.sleep(0.5)
    await live_manager.start()
    return RefreshResponse(status="reconnecting")

from simulation import (
    PitProjectionResult, YellowFlagResult, ERSPredictionResult,
    OvertakeSimulationResult, TireStrategyResult,
    predict_pit_stop, predict_yellow_flag_impact, predict_ers_impact,
    predict_overtake, predict_tire_strategy
)
from monte_carlo import simulate_race_outcomes, MonteCarloResult
from race_engineer import race_engineer_response, RaceEngineerResponse

class CalendarResponse(BaseModel):
    year: int
    races: list[str] = ["Bahrain", "Saudi Arabia", "Australia", "Japan", "China", "Miami", "Emilia Romagna", "Monaco", "Canada", "Spain", "Austria", "Great Britain", "Hungary", "Belgium", "Netherlands", "Italy", "Azerbaijan", "Singapore", "United States", "Mexico City", "São Paulo", "Las Vegas", "Qatar", "Abu Dhabi"]

@app.get("/api/calendar", response_model=CalendarResponse)
async def get_calendar(year: int = 2026):
    return CalendarResponse(year=year)

@app.get("/api/insights", response_model=RaceEngineerResponse)
async def get_insights(session_id: str = Depends(verify_session)):
    state = await data_store.get_state()
    # Mocking a dynamic question for the background polling
    return await race_engineer_response(
        question="Give me a quick tactical overview of the current race situation.",
        race_state=state
    )

@app.get("/api/pit_projection", response_model=PitProjectionResult)
async def get_pit_projection(driver_number: str):
    state = await data_store.get_state()
    target = next((c for c in state.cars if c.number == driver_number), None)
    if not target:
        raise HTTPException(status_code=404, detail="Driver not found")

    interval = None
    if target.interval:
        try:
            interval = float(target.interval.replace("+", "").replace("s", ""))
        except ValueError:
            pass

    return predict_pit_stop(target.pos, interval, state.cars)

@app.get("/api/yellow_flag_analysis", response_model=YellowFlagResult)
async def get_yellow_flag_analysis():
    state = await data_store.get_state()
    return predict_yellow_flag_impact(state.cars)

@app.get("/api/ers_prediction", response_model=ERSPredictionResult)
async def get_ers_prediction(driver_number: str, laps_remaining: int):
    # Mocking ERS level since we don't have it directly from basic LiveF1
    state = await data_store.get_state()
    target = next((c for c in state.cars if c.number == driver_number), None)
    if not target:
        raise HTTPException(status_code=404, detail="Driver not found")

    ers_level = 50 # Default mock
    return predict_ers_impact(driver_number, ers_level, laps_remaining)

@app.get("/api/overtake_simulation", response_model=OvertakeSimulationResult)
async def get_overtake_simulation(driver_number: str, target_number: str):
    state = await data_store.get_state()
    driver = next((c for c in state.cars if c.number == driver_number), None)
    target = next((c for c in state.cars if c.number == target_number), None)

    if not driver or not target:
        raise HTTPException(status_code=404, detail="Driver or target not found")

    return predict_overtake(driver, target, state.cars)

@app.get("/api/tire_strategy", response_model=TireStrategyResult)
async def get_tire_strategy(driver_number: str, laps_remaining: int):
    state = await data_store.get_state()
    driver = next((c for c in state.cars if c.number == driver_number), None)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    weather_temp = state.weather.get("track_temp", 30.0)
    return predict_tire_strategy(driver, laps_remaining, float(weather_temp))

@app.get("/api/monte_carlo", response_model=MonteCarloResult)
async def get_monte_carlo(simulations: int = 1000):
    state = await data_store.get_state()
    return simulate_race_outcomes(state, simulations)


class StripeSessionCreate(BaseModel):
    success_url: str
    cancel_url: str

class StripeSessionResponse(BaseModel):
    url: str

@app.post("/api/create_checkout", response_model=StripeSessionResponse)
async def create_checkout_session(body: StripeSessionCreate):
    try:
        session_id = str(uuid.uuid4())
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'unit_amount': 500,
                    'product_data': {
                        'name': 'GenieF1 Pro Session Unlock',
                        'description': 'Unlock AI Race Engineer and advanced simulations for the current session.',
                    },
                },
                'quantity': 1,
            }],
            mode='payment',
            success_url=f"{body.success_url}?session_id={session_id}",
            cancel_url=body.cancel_url,
            client_reference_id=session_id,
        )
        return StripeSessionResponse(url=checkout_session.url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class WebhookResponse(BaseModel):
    status: str

@app.post("/api/webhook/stripe", response_model=WebhookResponse)
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        sid = event["data"]["object"].get("client_reference_id")
        if sid:
            unlocked_sessions.add(sid)

    return WebhookResponse(status="success")

class UnlockDevResponse(BaseModel):
    status: str

@app.post("/api/unlock_dev", response_model=UnlockDevResponse)
async def unlock_session_dev(session_id: str):
    if settings.environment.lower() == "production":
        raise HTTPException(status_code=403, detail="Not available in production")
    unlocked_sessions.add(session_id)
    return UnlockDevResponse(status=f"Unlocked session {session_id}")

class HistoricalSessionsResponse(BaseModel):
    sessions: list[dict[str, Any]]

@app.get("/api/historical/sessions", response_model=HistoricalSessionsResponse)
async def get_historical_sessions(year: int, round: int):
    # Mock data for demonstration purposes
    return HistoricalSessionsResponse(sessions=[
        {"id": "session1", "name": "Practice 1", "date": "2026-03-20T10:00:00Z"},
        {"id": "session2", "name": "Qualifying", "date": "2026-03-21T14:00:00Z"},
        {"id": "session3", "name": "Race", "date": "2026-03-22T15:00:00Z"},
    ])

class HistoricalLapsResponse(BaseModel):
    laps: list[dict[str, Any]]

@app.get("/api/historical/laps", response_model=HistoricalLapsResponse)
async def get_historical_laps(year: int, round: int, session: str, driver: str):
    # Mock data for demonstration purposes
    return HistoricalLapsResponse(laps=[
        {"lap": 1, "time": 95.5, "compound": "SOFT"},
        {"lap": 2, "time": 93.2, "compound": "SOFT"},
        {"lap": 3, "time": 94.1, "compound": "SOFT"},
    ])

@app.websocket("/ws/race_data")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            state = await data_store.get_state()
            await websocket.send_text(state.model_dump_json())
            await asyncio.sleep(2.0)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
