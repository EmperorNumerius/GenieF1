"""
Integration tests for the FastAPI application.

Stripe webhook tests use a fake HMAC signature to avoid requiring real keys.
"""

import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Set required env vars before importing main
os.environ.setdefault("GROQ_API_KEY", "test-key")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_dummy")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_test_dummy")
os.environ.setdefault("STRIPE_PAYMENT_LINK", "https://buy.stripe.com/test_link")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")

import session_manager as sm
from main import app

client = TestClient(app)


def setup_function():
    sm._memory_store.clear()
    sm._redis_client = None


# ---------------------------------------------------------------------------
# /session/create
# ---------------------------------------------------------------------------

def test_create_session_endpoint():
    resp = client.post("/session/create")
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "payment_url" in data
    assert data["token"] in data["payment_url"]


# ---------------------------------------------------------------------------
# /session/{token}/status
# ---------------------------------------------------------------------------

def test_session_status_locked():
    token = sm.create_session()
    resp = client.get(f"/session/{token}/status")
    assert resp.status_code == 200
    assert resp.json()["unlocked"] is False


def test_session_status_after_unlock():
    token = sm.create_session()
    sm.unlock_session(token)
    resp = client.get(f"/session/{token}/status")
    assert resp.status_code == 200
    assert resp.json()["unlocked"] is True


def test_session_status_not_found():
    resp = client.get("/session/nonexistent-token/status")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /session/{token}/link-discord
# ---------------------------------------------------------------------------

def test_link_discord_requires_paid_session():
    token = sm.create_session()
    resp = client.post(
        f"/session/{token}/link-discord", json={"guild_id": "12345"}
    )
    assert resp.status_code == 403


def test_link_discord_success():
    token = sm.create_session()
    sm.unlock_session(token)
    resp = client.post(
        f"/session/{token}/link-discord", json={"guild_id": "99999"}
    )
    assert resp.status_code == 200
    assert resp.json()["guild_id"] == "99999"


def test_link_discord_missing_guild_id():
    token = sm.create_session()
    sm.unlock_session(token)
    resp = client.post(f"/session/{token}/link-discord", json={})
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# /timing endpoints
# ---------------------------------------------------------------------------

def test_timing_returns_dict():
    resp = client.get("/timing")
    assert resp.status_code == 200
    assert "drivers" in resp.json()


def test_timing_driver_not_found():
    resp = client.get("/timing/NOSUCHDRIVER")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /insights endpoint (auth gate)
# ---------------------------------------------------------------------------

def test_insights_requires_paid_token():
    token = sm.create_session()
    # Inject a fake driver so the 403 is returned before the 404
    import f1_data
    f1_data._timing_store["44"] = {"driver_number": "44"}
    resp = client.get(f"/insights/44?token={token}")
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Stripe webhook
# ---------------------------------------------------------------------------

def _stripe_sig(payload: bytes, secret: str) -> str:
    """Generate a valid Stripe webhook HMAC signature header."""
    ts = int(time.time())
    signed = f"{ts}.{payload.decode()}"
    mac = hmac.new(
        secret.encode(), signed.encode(), hashlib.sha256
    ).hexdigest()
    return f"t={ts},v1={mac}"


def test_stripe_webhook_unlocks_session():
    token = sm.create_session()
    payload = json.dumps(
        {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "client_reference_id": token,
                    "amount_total": 500,
                }
            },
        }
    ).encode()

    sig = _stripe_sig(payload, os.environ["STRIPE_WEBHOOK_SECRET"])
    resp = client.post(
        "/stripe/webhook",
        content=payload,
        headers={"stripe-signature": sig, "content-type": "application/json"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "unlocked"
    assert sm.is_unlocked(token)


def test_stripe_webhook_below_minimum():
    token = sm.create_session()
    payload = json.dumps(
        {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "client_reference_id": token,
                    "amount_total": 100,  # $1 – below minimum
                }
            },
        }
    ).encode()

    sig = _stripe_sig(payload, os.environ["STRIPE_WEBHOOK_SECRET"])
    resp = client.post(
        "/stripe/webhook",
        content=payload,
        headers={"stripe-signature": sig, "content-type": "application/json"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "below_minimum"
    assert not sm.is_unlocked(token)


def test_stripe_webhook_invalid_signature():
    payload = b'{"type": "checkout.session.completed"}'
    resp = client.post(
        "/stripe/webhook",
        content=payload,
        headers={
            "stripe-signature": "t=1,v1=invalidsig",
            "content-type": "application/json",
        },
    )
    assert resp.status_code == 400


def test_stripe_webhook_other_event_ignored():
    payload = json.dumps(
        {"type": "payment_intent.created", "data": {"object": {}}}
    ).encode()
    sig = _stripe_sig(payload, os.environ["STRIPE_WEBHOOK_SECRET"])
    resp = client.post(
        "/stripe/webhook",
        content=payload,
        headers={"stripe-signature": sig, "content-type": "application/json"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ignored"
