"""
OpenF1 API Client — Fetches live F1 race data.
Base URL: https://api.openf1.org/v1
Endpoints used:
  /sessions    — Current/recent sessions
  /position    — Live position data
  /car_data    — Telemetry (speed, RPM, gear, throttle, brake, DRS)
  /drivers     — Driver info
  /laps        — Lap times
  /intervals   — Gaps and intervals
  /stints      — Tire compound and stint info
  /pit         — Pit stop data
  /race_control — Race control messages (flags etc.)
  /weather     — Weather data
  /meetings    — Race weekend info
"""

import asyncio
import httpx
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

BASE_URL = "https://api.openf1.org/v1"

# 2026 F1 Teams & Drivers (projected)
TEAM_COLORS = {
    "Red Bull Racing": "#3671C6",
    "Ferrari": "#E80020",
    "McLaren": "#FF8000",
    "Mercedes": "#27F4D2",
    "Aston Martin": "#229971",
    "Racing Bulls": "#6692FF",
    "Williams": "#64C4FF",
    "Alpine": "#FF87BC",
    "Audi": "#00E701",
    "Haas F1 Team": "#B6BABD",
    "Cadillac": "#C4A747",
    # Fallbacks for older API data team names
    "Red Bull": "#3671C6",
    "Sauber": "#52E252",
    "RB": "#6692FF",
    "Kick Sauber": "#52E252",
    "Haas": "#B6BABD",
}


async def fetch(endpoint: str, params: Optional[Dict] = None) -> Any:
    """Make an async GET request to the OpenF1 API."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{BASE_URL}{endpoint}"
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.error(f"OpenF1 API error on {endpoint}: {e}")
        return None


async def get_latest_session() -> Optional[Dict]:
    """Get the most recent or current session."""
    data = await fetch("/sessions", {"session_key": "latest"})
    if data and len(data) > 0:
        return data[-1] if isinstance(data, list) else data
    return None


async def get_sessions_for_year(year: int = 2026) -> Optional[List]:
    """Get all sessions for a given year."""
    data = await fetch("/sessions", {"year": year})
    if not data:
        # Fallback to most recent year with data
        data = await fetch("/sessions", {"year": year - 1})
    return data


async def get_drivers(session_key: str) -> Optional[List[Dict]]:
    """Get all drivers in a session."""
    data = await fetch("/drivers", {"session_key": session_key})
    return data


async def get_positions(session_key: str) -> Optional[List[Dict]]:
    """Get latest position data for all drivers."""
    data = await fetch("/position", {"session_key": session_key})
    return data


async def get_latest_positions(session_key: str) -> Dict[int, Dict]:
    """Get the most recent position for each driver."""
    data = await get_positions(session_key)
    if not data:
        return {}
    
    latest = {}
    for entry in data:
        driver_num = entry.get("driver_number")
        if driver_num is not None:
            latest[driver_num] = entry  # The last entry for each driver is the most recent
    return latest


async def get_car_data(session_key: str, driver_number: Optional[int] = None) -> Optional[List[Dict]]:
    """Get car telemetry data (speed, RPM, gear, etc.)."""
    params: Dict[str, Any] = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    data = await fetch("/car_data", params)
    return data


async def get_latest_car_data(session_key: str) -> Dict[int, Dict]:
    """Get the most recent telemetry for each driver."""
    data = await get_car_data(session_key)
    if not data:
        return {}
    
    latest = {}
    for entry in data:
        driver_num = entry.get("driver_number")
        if driver_num is not None:
            latest[driver_num] = entry
    return latest


async def get_intervals(session_key: str) -> Optional[List[Dict]]:
    """Get interval data (gaps between cars)."""
    data = await fetch("/intervals", {"session_key": session_key})
    return data


async def get_latest_intervals(session_key: str) -> Dict[int, Dict]:
    """Get the most recent interval for each driver."""
    data = await get_intervals(session_key)
    if not data:
        return {}
    
    latest = {}
    for entry in data:
        driver_num = entry.get("driver_number")
        if driver_num is not None:
            latest[driver_num] = entry
    return latest


async def get_laps(session_key: str, driver_number: Optional[int] = None) -> Optional[List[Dict]]:
    """Get lap data."""
    params: Dict[str, Any] = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    data = await fetch("/laps", params)
    return data


async def get_stints(session_key: str) -> Optional[List[Dict]]:
    """Get stint data (tire compounds, tire age)."""
    data = await fetch("/stints", {"session_key": session_key})
    return data


async def get_latest_stints(session_key: str) -> Dict[int, Dict]:
    """Get the most recent stint for each driver."""
    data = await get_stints(session_key)
    if not data:
        return {}
    
    latest = {}
    for entry in data:
        driver_num = entry.get("driver_number")
        if driver_num is not None:
            latest[driver_num] = entry
    return latest


async def get_pit_stops(session_key: str) -> Optional[List[Dict]]:
    """Get pit stop data."""
    data = await fetch("/pit", {"session_key": session_key})
    return data


async def get_race_control(session_key: str) -> Optional[List[Dict]]:
    """Get race control messages (flags, VSC, SC, etc.)."""
    data = await fetch("/race_control", {"session_key": session_key})
    return data


async def get_weather(session_key: str) -> Optional[List[Dict]]:
    """Get weather data."""
    data = await fetch("/weather", {"session_key": session_key})
    return data


async def get_meetings(year: Optional[int] = None) -> Optional[List[Dict]]:
    """Get meeting (race weekend) data."""
    params = {}
    if year:
        params["year"] = year
    data = await fetch("/meetings", params)
    return data


def get_team_color(team_name: str) -> str:
    """Get team color from name, with fuzzy matching."""
    if not team_name:
        return "#888888"
    for key, color in TEAM_COLORS.items():
        if key.lower() in team_name.lower() or team_name.lower() in key.lower():
            return color
    return "#888888"


async def get_full_race_state(session_key: str) -> Dict:
    """
    Fetch and aggregate all live data into a single race state dict.
    This is the main function called by the WebSocket broadcaster.
    """
    # Fetch everything in parallel
    drivers_task = get_drivers(session_key)
    positions_task = get_latest_positions(session_key)
    car_data_task = get_latest_car_data(session_key)
    intervals_task = get_latest_intervals(session_key)
    stints_task = get_latest_stints(session_key)
    weather_task = get_weather(session_key)
    race_control_task = get_race_control(session_key)

    drivers, positions, car_data, intervals, stints, weather, race_control = await asyncio.gather(
        drivers_task, positions_task, car_data_task, intervals_task, stints_task, weather_task, race_control_task
    )

    if not drivers:
        return {"error": "No driver data available", "cars": []}

    cars = []
    for driver in drivers:
        num = driver.get("driver_number")
        if num is None:
            continue

        pos_data = positions.get(num, {})
        car = car_data.get(num, {})
        intv = intervals.get(num, {})
        stint = stints.get(num, {})

        team_name = driver.get("team_name", "")
        
        cars.append({
            "id": driver.get("name_acronym", "???"),
            "number": num,
            "name": f"{driver.get('first_name', '')} {driver.get('last_name', '')}".strip() or driver.get("full_name", f"Driver {num}"),
            "team": team_name,
            "color": driver.get("team_colour", get_team_color(team_name)),
            "pos": pos_data.get("position", 0),
            "speed": car.get("speed", 0),
            "rpm": car.get("rpm", 0),
            "gear": car.get("n_gear", 0),
            "throttle": car.get("throttle", 0),
            "brake": car.get("brake", 0),
            "drs": car.get("drs", 0),
            "interval": intv.get("interval", None),
            "gap_to_leader": intv.get("gap_to_leader", None),
            "tire": stint.get("compound", "Unknown"),
            "tire_age": stint.get("tyre_age_at_pit", stint.get("lap_end", 0)) - stint.get("lap_start", 0) if stint.get("lap_start") else 0,
            "stint_laps": stint.get("stint_number", 1),
        })

    # Sort by position
    cars.sort(key=lambda c: c["pos"] if c["pos"] else 999)

    # Latest weather
    latest_weather = weather[-1] if weather else None

    # Latest race control messages (last 5)
    recent_rc = race_control[-5:] if race_control else []

    return {
        "cars": cars,
        "weather": {
            "air_temp": latest_weather.get("air_temperature") if latest_weather else None,
            "track_temp": latest_weather.get("track_temperature") if latest_weather else None,
            "humidity": latest_weather.get("humidity") if latest_weather else None,
            "wind_speed": latest_weather.get("wind_speed") if latest_weather else None,
            "rainfall": latest_weather.get("rainfall") if latest_weather else None,
        } if latest_weather else None,
        "race_control": [
            {"message": rc.get("message", ""), "category": rc.get("category", ""), "flag": rc.get("flag", "")}
            for rc in recent_rc
        ],
    }
