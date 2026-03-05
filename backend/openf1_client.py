"""
OpenF1 API Client — Fetches live F1 race data with rate limiting and caching.
Base URL: https://api.openf1.org/v1
"""

import asyncio
import httpx
import logging
import time
from typing import Optional, Dict, List, Any

logger = logging.getLogger(__name__)

BASE_URL = "https://api.openf1.org/v1"

# Simple in-memory cache with TTL
_cache: Dict[str, Any] = {}
_cache_times: Dict[str, float] = {}
_last_request_time = 0.0
MIN_REQUEST_INTERVAL = 0.5  # Minimum 500ms between API requests

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
    "Red Bull": "#3671C6",
    "Sauber": "#52E252",
    "RB": "#6692FF",
    "Kick Sauber": "#52E252",
    "Haas": "#B6BABD",
}


def _cache_key(endpoint: str, params: Optional[Dict]) -> str:
    return f"{endpoint}|{sorted(params.items()) if params else ''}"


def _get_cached(key: str, ttl: float) -> Optional[Any]:
    if key in _cache and (time.time() - _cache_times.get(key, 0)) < ttl:
        return _cache[key]
    return None


def _set_cached(key: str, data: Any):
    _cache[key] = data
    _cache_times[key] = time.time()


async def fetch(endpoint: str, params: Optional[Dict] = None, cache_ttl: float = 10.0) -> Any:
    """Make a rate-limited, cached async GET to the OpenF1 API."""
    global _last_request_time

    key = _cache_key(endpoint, params)
    cached = _get_cached(key, cache_ttl)
    if cached is not None:
        return cached

    # Rate limiting
    now = time.time()
    wait = MIN_REQUEST_INTERVAL - (now - _last_request_time)
    if wait > 0:
        await asyncio.sleep(wait)
    _last_request_time = time.time()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{BASE_URL}{endpoint}"
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            _set_cached(key, data)
            return data
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            logger.warning(f"Rate limited on {endpoint}, using cache if available")
            return _cache.get(key)  # Return stale cache if available
        logger.error(f"OpenF1 HTTP error on {endpoint}: {e.response.status_code}")
        return _cache.get(key)
    except Exception as e:
        logger.error(f"OpenF1 error on {endpoint}: {e}")
        return _cache.get(key)


async def get_latest_session() -> Optional[Dict]:
    """Get the most recent or current session."""
    data = await fetch("/sessions", {"session_key": "latest"}, cache_ttl=30.0)
    if data and isinstance(data, list) and len(data) > 0:
        return data[-1]
    elif data and isinstance(data, dict):
        return data
    return None


async def get_drivers(session_key: str) -> Optional[List[Dict]]:
    """Get all drivers in a session. Cached for 60s since drivers don't change mid-session."""
    return await fetch("/drivers", {"session_key": session_key}, cache_ttl=60.0)


async def get_positions(session_key: str) -> Optional[List[Dict]]:
    """Get position data."""
    return await fetch("/position", {"session_key": session_key}, cache_ttl=8.0)


async def get_latest_positions(session_key: str) -> Dict[int, Dict]:
    data = await get_positions(session_key)
    if not data:
        return {}
    latest = {}
    for entry in data:
        dn = entry.get("driver_number")
        if dn is not None:
            latest[dn] = entry
    return latest


async def get_intervals(session_key: str) -> Optional[List[Dict]]:
    """Get interval data."""
    return await fetch("/intervals", {"session_key": session_key}, cache_ttl=8.0)


async def get_latest_intervals(session_key: str) -> Dict[int, Dict]:
    data = await get_intervals(session_key)
    if not data:
        return {}
    latest = {}
    for entry in data:
        dn = entry.get("driver_number")
        if dn is not None:
            latest[dn] = entry
    return latest


async def get_stints(session_key: str) -> Optional[List[Dict]]:
    """Get stint data (tire compounds)."""
    return await fetch("/stints", {"session_key": session_key}, cache_ttl=15.0)


async def get_latest_stints(session_key: str) -> Dict[int, Dict]:
    data = await get_stints(session_key)
    if not data:
        return {}
    latest = {}
    for entry in data:
        dn = entry.get("driver_number")
        if dn is not None:
            latest[dn] = entry
    return latest


async def get_laps(session_key: str, driver_number: Optional[int] = None) -> Optional[List[Dict]]:
    params: Dict[str, Any] = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    return await fetch("/laps", params, cache_ttl=10.0)


async def get_latest_laps(session_key: str) -> Dict[int, Dict]:
    data = await get_laps(session_key)
    if not data:
        return {}
    latest = {}
    for entry in data:
        dn = entry.get("driver_number")
        if dn is not None:
            latest[dn] = entry
    return latest


async def get_race_control(session_key: str) -> Optional[List[Dict]]:
    return await fetch("/race_control", {"session_key": session_key}, cache_ttl=10.0)


async def get_weather(session_key: str) -> Optional[List[Dict]]:
    return await fetch("/weather", {"session_key": session_key}, cache_ttl=30.0)


async def get_meetings(year: Optional[int] = None) -> Optional[List[Dict]]:
    params = {}
    if year:
        params["year"] = year
    return await fetch("/meetings", params, cache_ttl=3600.0)  # Cache 1 hour


def get_team_color(team_name: str) -> str:
    if not team_name:
        return "#888888"
    for key, color in TEAM_COLORS.items():
        if key.lower() in team_name.lower() or team_name.lower() in key.lower():
            return color
    return "#888888"


async def get_full_race_state(session_key: str) -> Dict:
    """
    Fetch and aggregate all live data into a single race state dict.
    Requests are made SEQUENTIALLY to respect rate limits.
    """
    # Fetch sequentially to avoid rate limiting (7 parallel = instant 429)
    drivers = await get_drivers(session_key)
    positions = await get_latest_positions(session_key)
    intervals = await get_latest_intervals(session_key)
    stints = await get_latest_stints(session_key)
    laps = await get_latest_laps(session_key)
    weather_data = await get_weather(session_key)
    race_control = await get_race_control(session_key)

    if not drivers:
        return {"error": "No driver data available", "cars": []}

    cars = []
    for driver in drivers:
        num = driver.get("driver_number")
        if num is None:
            continue

        pos_data = positions.get(num, {})
        intv = intervals.get(num, {})
        stint = stints.get(num, {})
        lap = laps.get(num, {})
        team_name = driver.get("team_name", "")
        team_color = driver.get("team_colour")
        if team_color and not team_color.startswith("#"):
            team_color = f"#{team_color}"
        if not team_color:
            team_color = get_team_color(team_name)

        # Calculate tire age
        tire_age = 0
        if stint.get("lap_start"):
            current_lap = lap.get("lap_number", stint.get("lap_end", stint.get("lap_start", 0)))
            tire_age = max(0, current_lap - stint.get("lap_start", 0))

        cars.append({
            "id": driver.get("name_acronym", "???"),
            "number": num,
            "name": f"{driver.get('first_name', '')} {driver.get('last_name', '')}".strip() or driver.get("full_name", f"Driver {num}"),
            "team": team_name,
            "color": team_color,
            "pos": pos_data.get("position", 0),
            "speed": 0,  # speed comes from car_data which is too heavy to poll
            "rpm": 0,
            "gear": 0,
            "throttle": 0,
            "brake": 0,
            "drs": 0,
            "interval": intv.get("interval", None),
            "gap_to_leader": intv.get("gap_to_leader", None),
            "tire": stint.get("compound", "Unknown"),
            "tire_age": tire_age,
            "stint_laps": stint.get("stint_number", 1),
            "last_lap_time": lap.get("lap_duration"),
            "lap_number": lap.get("lap_number", 0),
            "sector_1": lap.get("duration_sector_1"),
            "sector_2": lap.get("duration_sector_2"),
            "sector_3": lap.get("duration_sector_3"),
        })

    cars.sort(key=lambda c: c["pos"] if c["pos"] else 999)

    latest_weather = weather_data[-1] if weather_data else None
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
