"""
F1 live data provider.

Strategy
--------
1. **Live session (race weekend)** – connect to the OpenF1 live-timing
   SignalR websocket feed and stream car-data messages in real time.
2. **Fallback / development** – use the FastF1 library to replay the most
   recently loaded session so the rest of the application can be exercised
   without an active race.

The module exposes two public helpers:
  - ``get_live_timing()``  – returns the latest snapshot for every car.
  - ``subscribe(callback)`` – registers a coroutine that is called each time
    new data arrives from the websocket.
"""

import asyncio
import os
import time
from typing import Any, Callable, Awaitable

import fastf1
import httpx

# ---------------------------------------------------------------------------
# FastF1 cache setup
# ---------------------------------------------------------------------------
_cache_dir = os.getenv("FASTF1_CACHE_DIR", "/tmp/fastf1_cache")
os.makedirs(_cache_dir, exist_ok=True)
fastf1.Cache.enable_cache(_cache_dir)

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------
# Keyed by driver number (str): latest telemetry dict
_timing_store: dict[str, dict] = {}

# Subscribers registered via subscribe()
_subscribers: list[Callable[[dict], Awaitable[None]]] = []

# OpenF1 live API base URL
_OPENF1_BASE = "https://api.openf1.org/v1"


# ---------------------------------------------------------------------------
# Subscriber registration
# ---------------------------------------------------------------------------

def subscribe(callback: Callable[[dict], Awaitable[None]]) -> None:
    """Register an async callback invoked each time new telemetry arrives."""
    _subscribers.append(callback)


async def _notify(data: dict) -> None:
    for cb in _subscribers:
        try:
            await cb(data)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# OpenF1 REST polling (real-time race data)
# ---------------------------------------------------------------------------

async def _poll_openf1(session_key: str) -> None:
    """
    Poll the OpenF1 REST API at ~1 Hz and update _timing_store.

    OpenF1 returns per-driver timing and car-data objects; we merge them into
    a flat dict that matches the schema expected by groq_client.generate_insight.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        while True:
            try:
                # Fetch latest timing for all drivers
                timing_resp = await client.get(
                    f"{_OPENF1_BASE}/laps",
                    params={"session_key": session_key},
                )
                timing_resp.raise_for_status()
                laps = timing_resp.json()

                # Build a lookup: driver_number -> latest lap entry
                latest: dict[str, dict] = {}
                for lap in laps:
                    drv = str(lap.get("driver_number", ""))
                    if drv not in latest or (
                        lap.get("lap_number", 0)
                        > latest[drv].get("lap_number", 0)
                    ):
                        latest[drv] = lap

                # Fetch car-data (DRS, tire info available via stints)
                stints_resp = await client.get(
                    f"{_OPENF1_BASE}/stints",
                    params={"session_key": session_key},
                )
                stints_resp.raise_for_status()
                stints = stints_resp.json()

                # Build tire lookup: driver_number -> latest stint
                tire_info: dict[str, dict] = {}
                for stint in stints:
                    drv = str(stint.get("driver_number", ""))
                    if drv not in tire_info or (
                        stint.get("stint_number", 0)
                        > tire_info[drv].get("stint_number", 0)
                    ):
                        tire_info[drv] = stint

                # Fetch positions
                pos_resp = await client.get(
                    f"{_OPENF1_BASE}/position",
                    params={"session_key": session_key},
                )
                pos_resp.raise_for_status()
                positions_raw = pos_resp.json()
                pos_lookup: dict[str, int] = {}
                for p in positions_raw:
                    drv = str(p.get("driver_number", ""))
                    pos_lookup[drv] = p.get("position", 0)

                for drv, lap in latest.items():
                    stint = tire_info.get(drv, {})
                    # Lap start tyre age + laps in current stint
                    tyre_age = stint.get("tyre_age_at_start", 0) + (
                        lap.get("lap_number", 1) - stint.get("lap_start", 1)
                    )
                    snapshot = {
                        "driver_number": drv,
                        "driver_code": lap.get("driver_number", drv),
                        "position": pos_lookup.get(drv, 0),
                        "last_lap": lap.get("lap_duration"),
                        "sector_1": lap.get("duration_sector_1"),
                        "sector_2": lap.get("duration_sector_2"),
                        "sector_3": lap.get("duration_sector_3"),
                        "tire_compound": stint.get("compound", "UNKNOWN"),
                        "tire_age": tyre_age,
                        "drs_active": False,  # OpenF1 v1 doesn't expose DRS per lap
                        "gap_to_leader": lap.get("gap_to_leader", None),
                        "gap_to_car_ahead": lap.get("interval", None),
                        "timestamp": time.time(),
                    }
                    _timing_store[drv] = snapshot
                    await _notify(snapshot)

            except Exception:
                pass  # Keep polling even if a single request fails

            await asyncio.sleep(1)


# ---------------------------------------------------------------------------
# FastF1 fallback (development / replay)
# ---------------------------------------------------------------------------

def _build_fastf1_snapshot(session: Any) -> dict[str, dict]:
    """Return a timing snapshot from a FastF1 Session object."""
    snapshots: dict[str, dict] = {}
    try:
        laps = session.laps
        for drv in laps["DriverNumber"].unique():
            drv_laps = laps[laps["DriverNumber"] == drv]
            last_lap = drv_laps.iloc[-1]
            stint_col = "Compound" if "Compound" in drv_laps.columns else None
            compound = last_lap[stint_col] if stint_col else "UNKNOWN"
            snapshots[str(drv)] = {
                "driver_number": str(drv),
                "driver_code": last_lap.get("Driver", str(drv)),
                "position": int(last_lap.get("Position", 0) or 0),
                "last_lap": (
                    last_lap["LapTime"].total_seconds()
                    if hasattr(last_lap.get("LapTime"), "total_seconds")
                    else None
                ),
                "sector_1": (
                    last_lap["Sector1Time"].total_seconds()
                    if hasattr(last_lap.get("Sector1Time"), "total_seconds")
                    else None
                ),
                "sector_2": (
                    last_lap["Sector2Time"].total_seconds()
                    if hasattr(last_lap.get("Sector2Time"), "total_seconds")
                    else None
                ),
                "sector_3": (
                    last_lap["Sector3Time"].total_seconds()
                    if hasattr(last_lap.get("Sector3Time"), "total_seconds")
                    else None
                ),
                "tire_compound": str(compound),
                "tire_age": int(last_lap.get("TyreLife", 0) or 0),
                "drs_active": bool(last_lap.get("DRS", 0)),
                "gap_to_leader": None,
                "gap_to_car_ahead": None,
                "timestamp": time.time(),
            }
    except Exception:
        pass
    return snapshots


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_live_timing() -> dict[str, dict]:
    """Return the latest telemetry snapshot keyed by driver number string."""
    return dict(_timing_store)


async def start_live_feed(session_key: str) -> None:
    """
    Start polling the OpenF1 API for a specific session.

    Call this once at application startup (or when a new race session begins).
    ``session_key`` is the OpenF1 session key for the current race weekend.
    """
    asyncio.create_task(_poll_openf1(session_key))


def load_fastf1_session(year: int, grand_prix: str, identifier: str = "R") -> None:
    """
    Load a FastF1 session into the timing store (development / replay mode).

    Example:
        load_fastf1_session(2024, "Bahrain", "R")
    """
    session = fastf1.get_session(year, grand_prix, identifier)
    session.load(telemetry=False, weather=False)
    snapshots = _build_fastf1_snapshot(session)
    _timing_store.update(snapshots)
