"""
Groq API client for generating low-latency race-engineer insights.

The Groq API is used because of its extremely fast inference speed, which is
critical for surfacing insights while a race is still in progress.
"""

import os
from typing import Any

from groq import Groq

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.environ["GROQ_API_KEY"]
        _client = Groq(api_key=api_key)
    return _client


# System prompt that instructs the model to act as a race engineer
_SYSTEM_PROMPT = (
    "You are a highly experienced Formula 1 race engineer providing concise, "
    "real-time technical insights to a driver during a race. "
    "Analyse the telemetry data provided and highlight any actionable concerns "
    "or performance observations in two sentences or fewer. "
    "Use F1 jargon naturally (e.g., 'box', 'sector delta', 'deg', 'DRS'). "
    "Focus on the most critical information only."
)


def generate_insight(telemetry: dict[str, Any]) -> str:
    """
    Generate a race-engineer insight string from a telemetry snapshot.

    ``telemetry`` is expected to be a dict with at minimum:
        driver_number, driver_code, position,
        sector_1, sector_2, sector_3, last_lap,
        tire_compound, tire_age, drs_active,
        gap_to_leader, gap_to_car_ahead
    """
    prompt = (
        f"Driver #{telemetry.get('driver_number')} ({telemetry.get('driver_code')}) "
        f"is currently P{telemetry.get('position')}.\n"
        f"Sector times: S1={telemetry.get('sector_1')}s  "
        f"S2={telemetry.get('sector_2')}s  S3={telemetry.get('sector_3')}s  "
        f"Last lap={telemetry.get('last_lap')}s.\n"
        f"Tyre: {telemetry.get('tire_compound')} (age {telemetry.get('tire_age')} laps).\n"
        f"DRS: {'active' if telemetry.get('drs_active') else 'inactive'}.\n"
        f"Gap to leader: {telemetry.get('gap_to_leader')}s  "
        f"Gap to car ahead: {telemetry.get('gap_to_car_ahead')}s.\n"
        "Provide a concise race-engineer insight."
    )

    client = _get_client()
    response = client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=120,
        temperature=0.4,
    )
    return response.choices[0].message.content.strip()
