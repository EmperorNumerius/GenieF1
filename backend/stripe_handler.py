"""
Stripe webhook handler for GenieF1.

Stripe sends a POST to /stripe/webhook when payment events occur.
We listen for ``checkout.session.completed`` and unlock the corresponding
GenieF1 session using the ``client_reference_id`` field (which holds our
internal session token).
"""

import os

import stripe
from fastapi import APIRouter, Header, HTTPException, Request

from session_manager import unlock_session

router = APIRouter()


def _stripe_client() -> stripe.StripeClient:
    secret_key = os.environ["STRIPE_SECRET_KEY"]
    return stripe.StripeClient(secret_key)


@router.post("/stripe/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
) -> dict:
    """
    Receive and process Stripe webhook events.

    Stripe signs every webhook request; we verify the signature before
    processing to prevent spoofed events.
    """
    webhook_secret = os.environ["STRIPE_WEBHOOK_SECRET"]
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, webhook_secret
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if event["type"] == "checkout.session.completed":
        checkout_session = event["data"]["object"]
        # Verify that the minimum paid amount was met ($2 = 200 cents)
        amount_total = checkout_session.get("amount_total", 0)
        if amount_total < 200:
            # Below minimum – do not unlock
            return {"status": "below_minimum"}

        token = checkout_session.get("client_reference_id")
        if token:
            unlocked = unlock_session(token)
            if not unlocked:
                # Session token not found; log and continue
                return {"status": "session_not_found"}
            return {"status": "unlocked", "token": token}

    # Acknowledge receipt for all other event types
    return {"status": "ignored", "event_type": event["type"]}
