"""
race_engineer.py — AI Race Engineer Chat Backend
Provides tactical, terse F1 race engineer responses via Groq LLM using 2026 regs.
"""

import logging
import os
from groq import AsyncGroq
from pydantic import BaseModel
from livef1_client import RaceState

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "dummy_groq_key")
_groq_client = AsyncGroq(api_key=GROQ_API_KEY)

class RaceEngineerResponse(BaseModel):
    response: str
    context_used: dict

def _build_context(race_state: RaceState, driver_id: str | None) -> dict:
    """Extract relevant race context from race_state for the focused driver."""
    cars = race_state.cars
    weather = race_state.weather

    # Top 5 summary
    top5 = []
    for car in cars[:5]:
        top5.append(
            {
                "pos": car.pos,
                "name": car.name or car.id,
                "tire": car.tire,
                "tire_age": car.tire_age,
                "interval": car.interval or "—",
            }
        )

    context: dict = {
        "session_name": race_state.session_name,
        "session_type": race_state.session_type,
        "lap": race_state.lap,
        "total_laps": race_state.total_laps,
        "weather": {
            "air_temp": weather.get("air_temp"),
            "track_temp": weather.get("track_temp"),
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
                needle == str(car.id).casefold()
                or needle == str(car.number).casefold()
                or needle in str(car.name).casefold()
            ):
                focused = car
                break

        if focused:
            # Need to get car behind/ahead
            car_ahead = None
            car_behind = None
            for c in cars:
                if c.pos == focused.pos - 1:
                    car_ahead = c
                elif c.pos == focused.pos + 1:
                    car_behind = c

            context["focused_driver"] = {
                "id": focused.id,
                "name": focused.name or focused.id,
                "pos": focused.pos,
                "tire": focused.tire,
                "tire_age": focused.tire_age,
                "gap_to_leader": focused.gap_to_leader or "—",
                "interval": focused.interval or "—",
                "last_lap": focused.last_lap_time,
                "speed": focused.speed,
                "car_ahead": car_ahead.name if car_ahead else "None",
                "car_behind": car_behind.name if car_behind else "None",
            }

    return context


def _build_system_prompt() -> str:
    return (
        "You are a senior Formula 1 race engineer with 20 years of experience at a top team. "
        "Respond to driver and team questions with precise, tactical, data-driven answers. "
        "Be terse — maximum 3 sentences. Use F1 radio tone: direct, calm under pressure. "
        "Crucially, adhere to 2026 regulations: references must be to 'Overtake Mode' or 'OVR', NEVER 'DRS'. "
        "Engines use a 50/50 ICE/ERS power split. Aerodynamics are active ground effect. "
        "Reference the provided race context data when relevant."
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
            f"Last lap: {fd['last_lap']} | "
            f"Car ahead: {fd['car_ahead']} | "
            f"Car behind: {fd['car_behind']}"
        )

    lines.append(f"\nQuestion: {question}")
    return "\n".join(lines)


async def race_engineer_response(
    question: str,
    race_state: RaceState,
    driver_id: str | None = None,
) -> dict:
    context = _build_context(race_state, driver_id)
    system_prompt = _build_system_prompt()
    user_prompt = _build_user_prompt(question, context)

    # Note: we use _groq_client.chat.completions.create but using AsyncGroq properly
    # handles this asynchronously internally despite the seemingly synchronous method signature
    # (actually it exposes async create)

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
        fd = context.get("focused_driver")
        driver_name = fd["name"] if fd else "Driver"
        answer = (
            f"Copy {driver_name}. Data received. "
            "Focus on your rhythm — we'll advise on strategy next lap."
        )

    return {"response": answer, "context_used": context}