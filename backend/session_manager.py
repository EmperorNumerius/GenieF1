"""
Session manager for tracking paid user sessions.

Uses an in-memory store as the primary backend with optional Redis support.
A session is keyed by a UUID token generated at checkout.  When Stripe
confirms a successful payment the token is marked as "unlocked", granting
access to the AI insights feed and Discord-bot linking.
"""

import os
import json
import time
import uuid
from typing import Optional

# ---------------------------------------------------------------------------
# Optional Redis backend
# ---------------------------------------------------------------------------
_redis_client = None

try:
    import redis

    _redis_url = os.getenv("REDIS_URL", "")
    if _redis_url:
        _redis_client = redis.from_url(_redis_url, decode_responses=True)
        _redis_client.ping()
except Exception:
    _redis_client = None

# In-process fallback store: { token: { unlocked, discord_guild_id, created_at } }
_memory_store: dict[str, dict] = {}

# Sessions expire after 24 hours (seconds)
SESSION_TTL = 86_400


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> int:
    return int(time.time())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_session(discord_guild_id: Optional[str] = None) -> str:
    """
    Create a new (locked) session and return its token.

    The token is embedded in the Stripe Payment Link as a ``client_reference_id``
    so that the webhook can identify which session to unlock.
    """
    token = str(uuid.uuid4())
    data = {
        "unlocked": False,
        "discord_guild_id": discord_guild_id,
        "created_at": _now(),
    }

    if _redis_client:
        _redis_client.setex(f"session:{token}", SESSION_TTL, json.dumps(data))
    else:
        _memory_store[token] = data

    return token


def unlock_session(token: str, discord_guild_id: Optional[str] = None) -> bool:
    """
    Mark a session as paid/unlocked.  Returns True if the session existed.
    """
    if _redis_client:
        key = f"session:{token}"
        raw = _redis_client.get(key)
        if raw is None:
            return False
        data = json.loads(raw)
        data["unlocked"] = True
        if discord_guild_id:
            data["discord_guild_id"] = discord_guild_id
        _redis_client.setex(key, SESSION_TTL, json.dumps(data))
        return True
    else:
        if token not in _memory_store:
            return False
        _memory_store[token]["unlocked"] = True
        if discord_guild_id:
            _memory_store[token]["discord_guild_id"] = discord_guild_id
        return True


def get_session(token: str) -> Optional[dict]:
    """Return the session dict or None if not found."""
    if _redis_client:
        raw = _redis_client.get(f"session:{token}")
        return json.loads(raw) if raw else None
    return _memory_store.get(token)


def is_unlocked(token: str) -> bool:
    """Return True if the session exists and has been paid."""
    session = get_session(token)
    return bool(session and session.get("unlocked"))


def link_discord(token: str, guild_id: str) -> bool:
    """
    Associate a Discord guild with a paid session.
    Returns False if the session does not exist or is not yet paid.
    """
    if not is_unlocked(token):
        return False

    if _redis_client:
        key = f"session:{token}"
        raw = _redis_client.get(key)
        if raw is None:
            return False
        data = json.loads(raw)
        data["discord_guild_id"] = guild_id
        _redis_client.setex(key, SESSION_TTL, json.dumps(data))
    else:
        _memory_store[token]["discord_guild_id"] = guild_id

    return True
