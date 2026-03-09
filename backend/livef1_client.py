"""
LiveF1 client for real-time Formula 1 data via SignalR streaming.

Uses the livef1 library (https://github.com/goktugocal/livef1) to connect
directly to F1's live timing servers at livetiming.formula1.com.

Architecture:
- RealF1Client runs in a daemon thread (it owns its own asyncio loop)
- Incoming data is pushed into a thread-safe LiveF1DataStore
- FastAPI reads from the data store on a timer to build cached_state
"""

from __future__ import annotations

import datetime as dt
import logging
import threading
import time
from collections import deque
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ─── Team Colors ───────────────────────────────────────────────────────────────

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
}


def get_team_color(team_name: str) -> str:
    if not team_name:
        return "#888888"
    lower = team_name.casefold()
    for key, color in TEAM_COLORS.items():
        if key.casefold() in lower or lower in key.casefold():
            return color
    return "#888888"


# ─── Thread-safe Data Store ────────────────────────────────────────────────────

class LiveF1DataStore:
    """
    Thread-safe store for live F1 data received from the SignalR stream.
    Updated by the livef1 RealF1Client callback in a background thread,
    read by FastAPI in the main async loop.
    """

    def __init__(self):
        self._lock = threading.Lock()

        # Per-driver latest state (keyed by driver number as str)
        self.drivers: Dict[str, Dict[str, Any]] = {}          # DriverList
        self.car_data: Dict[str, Dict[str, Any]] = {}          # CarData.z
        self.positions: Dict[str, Dict[str, Any]] = {}         # Position.z
        self.timing_data: Dict[str, Dict[str, Any]] = {}       # TimingData
        self.current_tyres: Dict[str, Dict[str, Any]] = {}     # CurrentTyres
        self.tyre_stints: Dict[str, Dict[str, Any]] = {}       # TyreStintSeries

        # Session-level state
        self.session_info: Dict[str, Any] = {}                 # SessionInfo
        self.track_status: Dict[str, Any] = {}                 # TrackStatus
        self.weather: Dict[str, Any] = {}                      # WeatherData
        self.race_control: deque = deque(maxlen=50)            # RaceControlMessages

        # Connection health
        self.connected = False
        self.last_update_at: Optional[str] = None
        self.last_error: Optional[str] = None
        self.message_count = 0

    def update_car_data(self, records: list):
        with self._lock:
            for rec in records:
                dn = str(rec.get("DriverNo", ""))
                if dn:
                    self.car_data[dn] = rec
            self._mark_updated()

    def update_positions(self, records: list):
        with self._lock:
            for rec in records:
                dn = str(rec.get("DriverNo", ""))
                if dn:
                    self.positions[dn] = rec
            self._mark_updated()

    def update_drivers(self, records: list):
        with self._lock:
            for rec in records:
                # DriverList records may have RacingNumber or Tla
                dn = str(rec.get("RacingNumber", rec.get("DriverNo", "")))
                if dn:
                    # Merge into existing (incremental updates)
                    existing = self.drivers.get(dn, {})
                    existing.update(rec)
                    self.drivers[dn] = existing
            self._mark_updated()

    def update_timing(self, records: list):
        with self._lock:
            for rec in records:
                dn = str(rec.get("DriverNo", ""))
                if dn:
                    existing = self.timing_data.get(dn, {})
                    existing.update(rec)
                    self.timing_data[dn] = existing
            self._mark_updated()

    def update_session_info(self, records: list):
        with self._lock:
            for rec in records:
                self.session_info.update(rec)
            self._mark_updated()

    def update_track_status(self, records: list):
        with self._lock:
            for rec in records:
                self.track_status.update(rec)
            self._mark_updated()

    def update_weather(self, records: list):
        with self._lock:
            for rec in records:
                self.weather.update(rec)
            self._mark_updated()

    def update_race_control(self, records: list):
        with self._lock:
            for rec in records:
                self.race_control.append(rec)
            self._mark_updated()

    def update_current_tyres(self, records: list):
        with self._lock:
            for rec in records:
                dn = str(rec.get("DriverNo", ""))
                if dn:
                    self.current_tyres[dn] = rec
            self._mark_updated()

    def update_tyre_stints(self, records: list):
        with self._lock:
            for rec in records:
                dn = str(rec.get("DriverNo", ""))
                if dn:
                    existing = self.tyre_stints.get(dn, {})
                    existing.update(rec)
                    self.tyre_stints[dn] = existing
            self._mark_updated()

    def _mark_updated(self):
        self.last_update_at = _iso_now()
        self.message_count += 1

    def snapshot(self) -> Dict[str, Any]:
        """Return a copy of all data for thread-safe reading."""
        with self._lock:
            return {
                "drivers": dict(self.drivers),
                "car_data": dict(self.car_data),
                "positions": dict(self.positions),
                "timing_data": dict(self.timing_data),
                "current_tyres": dict(self.current_tyres),
                "tyre_stints": dict(self.tyre_stints),
                "session_info": dict(self.session_info),
                "track_status": dict(self.track_status),
                "weather": dict(self.weather),
                "race_control": list(self.race_control),
                "connected": self.connected,
                "last_update_at": self.last_update_at,
                "message_count": self.message_count,
            }


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _iso_now() -> str:
    return _utc_now().isoformat()


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


# ─── Topic handler dispatch ────────────────────────────────────────────────────

# Maps livef1 topic names to DataStore update methods
_TOPIC_HANDLERS = {
    "CarData.z":            "update_car_data",
    "Position.z":           "update_positions",
    "DriverList":           "update_drivers",
    "TimingData":           "update_timing",
    "TimingDataF1":         "update_timing",
    "SessionInfo":          "update_session_info",
    "TrackStatus":          "update_track_status",
    "WeatherData":          "update_weather",
    "RaceControlMessages":  "update_race_control",
    "CurrentTyres":         "update_current_tyres",
    "TyreStintSeries":      "update_tyre_stints",
}

# Topics to subscribe to via SignalR
SUBSCRIBED_TOPICS = list(_TOPIC_HANDLERS.keys())


# ─── LiveF1 Background Thread ─────────────────────────────────────────────────

def _run_livef1_client(data_store: LiveF1DataStore):
    """
    Entry point for the daemon thread. Creates a RealF1Client,
    registers a callback, and calls client.run() (blocking).
    """
    try:
        from livef1.adapters import RealF1Client
    except ImportError as e:
        logger.error("livef1 is not installed: %s", e)
        data_store.last_error = f"livef1 not installed: {e}"
        return

    logger.info("Starting LiveF1 SignalR client with topics: %s", SUBSCRIBED_TOPICS)

    client = RealF1Client(topics=SUBSCRIBED_TOPICS)
    data_store.connected = True

    @client.callback("genie_f1_handler")
    async def handle_records(records):
        try:
            for topic_name, topic_records in records.items():
                handler_name = _TOPIC_HANDLERS.get(topic_name)
                if handler_name:
                    handler = getattr(data_store, handler_name)
                    handler(list(topic_records))
                else:
                    logger.debug("Unhandled topic: %s", topic_name)
        except Exception as exc:
            logger.warning("Error processing topic data: %s", exc)
            data_store.last_error = str(exc)

    try:
        client.run()  # Blocking — runs forever
    except Exception as exc:
        logger.error("LiveF1 client exited with error: %s", exc)
        data_store.last_error = str(exc)
    finally:
        data_store.connected = False
        logger.info("LiveF1 client thread stopped.")


def start_livef1_thread(data_store: LiveF1DataStore) -> threading.Thread:
    """Start the livef1 client in a daemon thread."""
    thread = threading.Thread(
        target=_run_livef1_client,
        args=(data_store,),
        name="livef1-signalr",
        daemon=True,
    )
    thread.start()
    logger.info("LiveF1 background thread started.")
    return thread


# ─── Race State Builder ───────────────────────────────────────────────────────

def get_full_race_state(data_store: LiveF1DataStore) -> Dict[str, Any]:
    """
    Build a race state dict matching the frontend's expected JSON shape.
    Reads from the thread-safe data store snapshot.
    """
    snap = data_store.snapshot()

    drivers_map = snap["drivers"]
    car_data_map = snap["car_data"]
    positions_map = snap["positions"]
    timing_map = snap["timing_data"]
    tyres_map = snap["current_tyres"]
    stints_map = snap["tyre_stints"]
    weather_data = snap["weather"]
    rc_messages = snap["race_control"]

    if not drivers_map and not car_data_map:
        return {
            "error": "Waiting for live data — no F1 session currently active, or data is still loading.",
            "cars": [],
            "weather": None,
            "race_control": [],
            "updated_at": _iso_now(),
        }

    # Build cars list.  Merge data from all sources per driver number.
    all_driver_numbers = set()
    all_driver_numbers.update(drivers_map.keys())
    all_driver_numbers.update(car_data_map.keys())
    all_driver_numbers.update(positions_map.keys())
    all_driver_numbers.update(timing_map.keys())

    cars: List[Dict[str, Any]] = []
    for dn in all_driver_numbers:
        driver = drivers_map.get(dn, {})
        telem = car_data_map.get(dn, {})
        pos = positions_map.get(dn, {})
        timing = timing_map.get(dn, {})
        tyres = tyres_map.get(dn, {})
        stint = stints_map.get(dn, {})

        # Driver identity
        first_name = driver.get("FirstName", driver.get("first_name", ""))
        last_name = driver.get("LastName", driver.get("last_name", ""))
        full_name = f"{first_name} {last_name}".strip() or driver.get("FullName", f"Driver {dn}")
        tla = driver.get("Tla", driver.get("name_acronym", dn))
        team_name = driver.get("TeamName", driver.get("team_name", ""))
        team_color = driver.get("TeamColour", "")
        if team_color and not str(team_color).startswith("#"):
            team_color = f"#{team_color}"
        if not team_color:
            team_color = get_team_color(team_name)

        # Position — from Position.z or TimingData
        position = _as_int(timing.get("Position", pos.get("Position", 0)), 0)

        # Tire info from CurrentTyres or TyreStintSeries
        compound = tyres.get("Compound", stint.get("Compound", "Unknown"))
        tire_age = _as_int(tyres.get("New", stint.get("TyreAge", 0)), 0)
        if tyres.get("New") == "true" or tyres.get("New") is True:
            tire_age = 0 

        # Lap info from TimingData
        lap_number = _as_int(timing.get("NumberOfLaps", 0), 0)
        last_lap_time = timing.get("LastLapTime_Value", timing.get("LastLapTime", None))
        sector_1 = timing.get("Sectors_1_Value", None)
        sector_2 = timing.get("Sectors_2_Value", None)
        sector_3 = timing.get("Sectors_3_Value", None)

        # Gap/interval
        interval = timing.get("IntervalToPositionAhead_Value", timing.get("IntervalToPositionAhead", None))
        gap_to_leader = timing.get("GapToLeader_Value", timing.get("GapToLeader", None))

        # Stints count
        stint_count = _as_int(stint.get("PitCount", timing.get("NumberOfPitStops", 1)), 1)

        cars.append({
            "id": tla,
            "number": _as_int(dn, 0),
            "name": full_name,
            "team": team_name,
            "color": team_color,
            "pos": position,
            "speed": _as_int(telem.get("speed", 0), 0),
            "rpm": _as_int(telem.get("rpm", 0), 0),
            "gear": _as_int(telem.get("n_gear", 0), 0),
            "throttle": _as_int(telem.get("throttle", 0), 0),
            "brake": _as_int(telem.get("brake", 0), 0),
            "drs": _as_int(telem.get("drs", 0), 0),
            "interval": interval,
            "gap_to_leader": gap_to_leader,
            "tire": compound,
            "tire_age": tire_age,
            "stint_laps": stint_count,
            "last_lap_time": last_lap_time,
            "lap_number": lap_number,
            "sector_1": sector_1,
            "sector_2": sector_2,
            "sector_3": sector_3,
            "location": {
                "x": _as_float(pos.get("X", 0), 0.0),
                "y": _as_float(pos.get("Y", 0), 0.0),
                "z": _as_float(pos.get("Z", 0), 0.0),
            },
            "telemetry_timestamp": telem.get("Utc", telem.get("timestamp")),
        })

    # Sort by position
    cars.sort(key=lambda c: c["pos"] if c.get("pos", 0) > 0 else 999)

    # Weather
    weather_out = None
    if weather_data:
        weather_out = {
            "air_temp": weather_data.get("AirTemp"),
            "track_temp": weather_data.get("TrackTemp"),
            "humidity": weather_data.get("Humidity"),
            "wind_speed": weather_data.get("WindSpeed"),
            "rainfall": weather_data.get("Rainfall"),
        }

    # Race control (last 8)
    recent_rc = rc_messages[-8:] if rc_messages else []

    return {
        "cars": cars,
        "weather": weather_out,
        "race_control": [
            {
                "message": rc.get("Message", ""),
                "category": rc.get("Category", ""),
                "flag": rc.get("Flag", ""),
                "scope": rc.get("Scope", ""),
            }
            for rc in recent_rc
        ],
        "updated_at": snap.get("last_update_at") or _iso_now(),
    }


# ─── Session Info Builder ─────────────────────────────────────────────────────

def get_session_info(data_store: LiveF1DataStore) -> Optional[Dict[str, Any]]:
    """Build session metadata from the data store."""
    snap = data_store.snapshot()
    si = snap["session_info"]
    if not si:
        return None

    meeting = si.get("Meeting", {}) if isinstance(si.get("Meeting"), dict) else {}

    return {
        "key": si.get("Key", si.get("SessionKey")),
        "name": si.get("Name", si.get("SessionName", "")),
        "type": si.get("Type", ""),
        "circuit": meeting.get("Circuit", {}).get("ShortName", "") if isinstance(meeting.get("Circuit"), dict) else "",
        "country": meeting.get("Country", {}).get("Name", "") if isinstance(meeting.get("Country"), dict) else "",
        "meeting_name": meeting.get("Name", meeting.get("OfficialName", "")),
        "meeting_official_name": meeting.get("OfficialName", meeting.get("Name", "")),
        "status": snap["track_status"].get("Status", si.get("Status", "")),
        "year": si.get("StartDate", "")[:4] if si.get("StartDate") else None,
        "date_start": si.get("StartDate"),
        "date_end": si.get("EndDate"),
    }


# ─── API Status ────────────────────────────────────────────────────────────────

def get_api_status(data_store: LiveF1DataStore) -> Dict[str, Any]:
    """Connection health for the /api/status endpoint."""
    snap = data_store.snapshot()
    return {
        "authenticated": True,  # livef1 uses public F1 servers, no auth needed
        "auth_source": "livef1_signalr",
        "has_api_key": False,
        "has_credential_pair": False,
        "auth_error": None,
        "last_fetch_error": snap.get("last_error") if not snap["connected"] else None,
        "last_success_at": snap["last_update_at"],
        "backoff_seconds": 0,
        "connected": snap["connected"],
        "message_count": snap["message_count"],
    }


# ─── Historical Data Helpers ──────────────────────────────────────────────────

def get_meetings_for_year(year: int) -> List[Dict[str, Any]]:
    """
    Use livef1's historical API to get all meetings for a given year.
    Returns a list of meeting dicts compatible with the /api/calendar endpoint.
    """
    try:
        import livef1
        season = livef1.get_season(year)

        meetings = []
        for meeting in season.meetings:
            meetings.append({
                "meeting_key": meeting.key,
                "meeting_name": getattr(meeting, "name", ""),
                "meeting_official_name": getattr(meeting, "officialname", ""),
                "country_name": getattr(meeting, "country", {}).get("Name", "") if isinstance(getattr(meeting, "country", None), dict) else str(getattr(meeting, "country", "")),
                "circuit_short_name": getattr(meeting, "circuit", {}).get("ShortName", "") if isinstance(getattr(meeting, "circuit", None), dict) else str(getattr(meeting, "circuit", "")),
                "location": getattr(meeting, "location", ""),
                "year": year,
            })
        return meetings
    except Exception as exc:
        logger.warning("Failed to get meetings for year %d: %s", year, exc)
        return []
