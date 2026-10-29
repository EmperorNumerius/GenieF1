"""
race_engineer.py — AI Race Engineer Chat Backend
Provides tactical, terse F1 race engineer responses via Groq LLM.
"""

import logging
import os
from typing import Optional

from groq import AsyncGroq

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "dummy_groq_key")
_groq_client = AsyncGroq(api_key=GROQ_API_KEY)


def _parse_lap_time(raw: str | None) -> float | None:
    """Convert 'M:SS.mmm' or 'SS.mmm' string to total seconds. Returns None on failure."""
    if not raw:
        return None
    raw = str(raw).strip()
    try:
        if ":" in raw:
            mins, rest = raw.split(":", 1)
            return int(mins) * 60 + float(rest)
        return float(raw)
    except (ValueError, TypeError):
        return None


def _build_context(race_state: dict, driver_id: str | None) -> dict:
    """Extract relevant race context from race_state for the focused driver."""
    cars = race_state.get("cars", [])
    session = race_state.get("session") or {}
    weather = race_state.get("weather") or {}

    # Top 5 summary
    top5 = []
    for car in cars[:5]:
        top5.append(
            {
                "pos": car.get("pos"),
                "name": car.get("name", car.get("id", "?")),
                "tire": car.get("tire", "?"),
                "tire_age": car.get("tire_age", 0),
                "interval": car.get("interval", "—"),
            }
        )

    context: dict = {
        "session_name": session.get("meeting_name", "Unknown Session"),
        "session_type": session.get("type", "Race"),
        "lap": race_state.get("lap"),
        "total_laps": race_state.get("total_laps"),
        "weather": {
            "air_temp": weather.get("air_temperature"),
            "track_temp": weather.get("track_temperature"),
            "rainfall": weather.get("rainfall", False),
        },
        "top5": top5,
    }

    # Focused driver context
    if driver_id:
        focused = None
        needle = str(driver_id).strip().casefold()
        for car in cars:
            if (
                needle == str(car.get("id", "")).casefold()
                or needle == str(car.get("number", "")).casefold()
                or needle in str(car.get("name", "")).casefold()
            ):
                focused = car
                break

        if focused:
            context["focused_driver"] = {
                "id": focused.get("id"),
                "name": focused.get("name", focused.get("id", "Unknown")),
                "pos": focused.get("pos"),
                "tire": focused.get("tire", "UNKNOWN"),
                "tire_age": focused.get("tire_age", 0),
                "gap_to_leader": focused.get("gap_to_leader", "—"),
                "interval": focused.get("interval", "—"),
                "last_lap": focused.get("last_lap_time"),
                "speed": focused.get("speed"),
            }

    return context


def _build_system_prompt() -> str:
    return (
        "You are a senior Formula 1 race engineer with 20 years of experience at a top team. "
        "Respond to driver and team questions with precise, tactical, data-driven answers. "
        "Be terse — maximum 3 sentences. Use F1 radio tone: direct, calm under pressure. "
        "Reference the race context data provided when relevant."
    )


def _build_user_prompt(question: str, context: dict) -> str:
    lines = [
        f"Session: {context.get('session_name')} ({context.get('session_type')})",
        f"Lap: {context.get('lap')}/{context.get('total_laps')}",
    ]

    weather = context.get("weather", {})
    if weather.get("air_temp") is not None:
        lines.append(
            f"Weather: Air {weather['air_temp']}°C | Track {weather.get('track_temp')}°C"
            + (" | RAIN" if weather.get("rainfall") else "")
        )

    top5 = context.get("top5", [])
    if top5:
        top5_str = ", ".join(
            f"P{c['pos']} {c['name']} ({c['tire']}/{c['tire_age']}L)"
            for c in top5
            if c.get("pos") is not None
        )
        lines.append(f"Top 5: {top5_str}")

    fd = context.get("focused_driver")
    if fd:
        lines.append(
            f"Your driver: {fd['name']} P{fd['pos']} | "
            f"Tire: {fd['tire']} age {fd['tire_age']} laps | "
            f"Gap to leader: {fd['gap_to_leader']} | "
            f"Interval (gap ahead): {fd['interval']} | "
            f"Last lap: {fd['last_lap']}"
        )

    lines.append(f"\nQuestion: {question}")
    return "\n".join(lines)


async def race_engineer_response(
    question: str,
    race_state: dict,
    driver_id: str | None = None,
) -> dict:
    """
    Generate a senior F1 race engineer response to a tactical question.

    Args:
        question: The question or command from the driver/team.
        race_state: Current race state dict (from data_store / cached_state).
        driver_id: Optional driver identifier to focus context on.

    Returns:
        {"response": str, "context_used": dict}
    """
    context = _build_context(race_state, driver_id)
    system_prompt = _build_system_prompt()
    user_prompt = _build_user_prompt(question, context)

    try:
        resp = await _groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model="llama3-8b-8192",
            temperature=0.5,
            max_tokens=120,
        )
        answer = resp.choices[0].message.content.strip()
    except Exception as exc:
        logger.error("Groq error in race_engineer_response: %s", exc)
        # Graceful fallback — basic tactical guidance
        fd = context.get("focused_driver")
        driver_name = fd["name"] if fd else "Driver"
        answer = (
            f"Copy {driver_name}. Data received. "
            "Focus on your rhythm — we'll advise on strategy next lap."
        )

    return {"response": answer, "context_used": context}
