"""
Unit tests for session_manager.py
"""

import pytest
import session_manager as sm


def setup_function():
    """Clear in-memory store before each test."""
    sm._memory_store.clear()
    sm._redis_client = None  # force in-memory mode for tests


# ---------------------------------------------------------------------------
# create_session
# ---------------------------------------------------------------------------

def test_create_session_returns_token():
    token = sm.create_session()
    assert isinstance(token, str) and len(token) > 0


def test_create_session_not_unlocked_by_default():
    token = sm.create_session()
    assert not sm.is_unlocked(token)


def test_create_session_with_guild():
    token = sm.create_session(discord_guild_id="99999")
    session = sm.get_session(token)
    assert session["discord_guild_id"] == "99999"


# ---------------------------------------------------------------------------
# unlock_session
# ---------------------------------------------------------------------------

def test_unlock_session_marks_as_unlocked():
    token = sm.create_session()
    result = sm.unlock_session(token)
    assert result is True
    assert sm.is_unlocked(token)


def test_unlock_nonexistent_session_returns_false():
    assert sm.unlock_session("nonexistent-token") is False


def test_unlock_session_sets_guild_id():
    token = sm.create_session()
    sm.unlock_session(token, discord_guild_id="12345")
    session = sm.get_session(token)
    assert session["discord_guild_id"] == "12345"


# ---------------------------------------------------------------------------
# get_session
# ---------------------------------------------------------------------------

def test_get_session_returns_none_for_unknown():
    assert sm.get_session("unknown-token") is None


def test_get_session_returns_dict():
    token = sm.create_session()
    session = sm.get_session(token)
    assert isinstance(session, dict)
    assert "unlocked" in session


# ---------------------------------------------------------------------------
# link_discord
# ---------------------------------------------------------------------------

def test_link_discord_fails_on_unpaid_session():
    token = sm.create_session()
    assert sm.link_discord(token, "guild_1") is False


def test_link_discord_succeeds_on_paid_session():
    token = sm.create_session()
    sm.unlock_session(token)
    assert sm.link_discord(token, "guild_2") is True
    session = sm.get_session(token)
    assert session["discord_guild_id"] == "guild_2"


def test_link_discord_fails_on_unknown_token():
    assert sm.link_discord("no-such-token", "guild_3") is False
