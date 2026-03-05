"""
GenieF1 – FastAPI backend

Endpoints
---------
GET  /session/create           Create a new (locked) session token
GET  /session/{token}/status   Check if a session is unlocked
POST /session/{token}/link-discord  Link a Discord guild to a paid session
GET  /timing                   Current live timing snapshot (all drivers)
GET  /timing/{driver}          Telemetry for a single driver
GET  /insights/{driver}        AI race-engineer insight for a driver (paid)
WS   /ws/insights/{token}      WebSocket stream of insights (paid)
POST /stripe/webhook           Stripe payment webhook (see stripe_handler)
"""

import asyncio
import os
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import f1_data
import groq_client
import session_manager
from stripe_handler import router as stripe_router

# ---------------------------------------------------------------------------
# Application lifespan – start the live feed when the server starts
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Try to start the live OpenF1 feed for the current season session.
    # In development the OPENF1_SESSION_KEY env var may not be set, which is fine.
    session_key = os.getenv("OPENF1_SESSION_KEY", "")
    if session_key:
        asyncio.create_task(f1_data.start_live_feed(session_key))
    yield


app = FastAPI(title="GenieF1 API", version="1.0.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Include stripe router
# ---------------------------------------------------------------------------
app.include_router(stripe_router)

# ---------------------------------------------------------------------------
# Session endpoints
# ---------------------------------------------------------------------------


@app.post("/session/create")
async def create_session() -> dict:
    """
    Create a new locked session and return:
      - ``token``        – embed as ``client_reference_id`` in the Payment Link
      - ``payment_url``  – the full Stripe Payment Link URL for this session
    """
    token = session_manager.create_session()
    base_url = os.environ.get("STRIPE_PAYMENT_LINK", "")
    payment_url = f"{base_url}?client_reference_id={token}" if base_url else None
    return {"token": token, "payment_url": payment_url}


@app.get("/session/{token}/status")
async def session_status(token: str) -> dict:
    session = session_manager.get_session(token)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "token": token,
        "unlocked": session.get("unlocked", False),
        "discord_guild_id": session.get("discord_guild_id"),
    }


@app.post("/session/{token}/link-discord")
async def link_discord(token: str, body: dict) -> dict:
    guild_id = body.get("guild_id", "")
    if not guild_id:
        raise HTTPException(status_code=400, detail="guild_id required")
    success = session_manager.link_discord(token, guild_id)
    if not success:
        raise HTTPException(
            status_code=403,
            detail="Session not found or not yet paid",
        )
    return {"status": "linked", "guild_id": guild_id}


# ---------------------------------------------------------------------------
# Timing endpoints
# ---------------------------------------------------------------------------


@app.get("/timing")
async def get_timing() -> dict:
    """Return the latest telemetry snapshot for all drivers."""
    return {"drivers": f1_data.get_live_timing()}


@app.get("/timing/{driver}")
async def get_driver_timing(driver: str) -> dict:
    timing = f1_data.get_live_timing()
    if driver not in timing:
        raise HTTPException(status_code=404, detail="Driver not found")
    return timing[driver]


# ---------------------------------------------------------------------------
# AI insights endpoints (require a paid session token)
# ---------------------------------------------------------------------------


def _require_unlocked(token: str) -> None:
    if not session_manager.is_unlocked(token):
        raise HTTPException(
            status_code=403,
            detail="Access denied – please complete payment to unlock AI insights",
        )


@app.get("/insights/{driver}")
async def get_insight(driver: str, token: str) -> dict:
    """
    Generate a one-shot AI insight for a driver.

    Requires ``?token=<session_token>`` query parameter from a paid session.
    """
    _require_unlocked(token)

    timing = f1_data.get_live_timing()
    if driver not in timing:
        raise HTTPException(status_code=404, detail="Driver not found")

    telemetry = timing[driver]
    insight = groq_client.generate_insight(telemetry)
    return {"driver": driver, "insight": insight, "telemetry": telemetry}


# ---------------------------------------------------------------------------
# WebSocket stream of insights
# ---------------------------------------------------------------------------

# Active WebSocket connections per session token
_ws_connections: dict[str, list[WebSocket]] = {}


async def _insight_broadcaster(telemetry: dict[str, Any]) -> None:
    """
    Callback registered with f1_data.subscribe().

    For every new telemetry snapshot we generate an AI insight and push it to
    all WebSocket clients whose session token is unlocked.
    """
    for token, sockets in list(_ws_connections.items()):
        if not session_manager.is_unlocked(token):
            continue
        try:
            insight = groq_client.generate_insight(telemetry)
        except Exception:
            insight = "Unable to generate insight at this time."

        message = {
            "driver": telemetry.get("driver_number"),
            "insight": insight,
            "telemetry": telemetry,
        }
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            sockets.remove(ws)


# Register the broadcaster once
f1_data.subscribe(_insight_broadcaster)


@app.websocket("/ws/insights/{token}")
async def ws_insights(websocket: WebSocket, token: str) -> None:
    """
    WebSocket endpoint for streaming live AI insights.

    The client connects with their session token.  If the session is not
    unlocked, the server immediately closes the connection with code 4003.
    """
    if not session_manager.is_unlocked(token):
        await websocket.close(code=4003, reason="Unlock required")
        return

    await websocket.accept()
    _ws_connections.setdefault(token, []).append(websocket)

    try:
        # Keep the connection alive; actual messages are pushed by the broadcaster
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        connections = _ws_connections.get(token, [])
        if websocket in connections:
            connections.remove(websocket)
