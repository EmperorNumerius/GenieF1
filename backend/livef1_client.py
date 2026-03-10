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

        # Position history for racing lines (last N entries per driver)
        self.position_history: Dict[str, deque] = {}           # deque of {x, y}
        self.track_outline: List[List[float]] = []             # [[x,y], ...]

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
                    # Track position history for racing lines
                    x = rec.get("X", 0)
                    y = rec.get("Y", 0)
                    if x or y:
                        if dn not in self.position_history:
                            self.position_history[dn] = deque(maxlen=300)
                        self.position_history[dn].append([float(x), float(y)])
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
                "position_history": {dn: list(q) for dn, q in self.position_history.items()},
                "track_outline": list(self.track_outline),
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

# Fallback driver info for F1 grid
DRIVER_INFO = {
    1: {"tla": "VER", "name": "Max Verstappen", "team": "Red Bull Racing"},
    2: {"tla": "SAR", "name": "Logan Sargeant", "team": "Williams"},
    3: {"tla": "RIC", "name": "Daniel Ricciardo", "team": "RB"},
    4: {"tla": "NOR", "name": "Lando Norris", "team": "McLaren"},
    7: {"tla": "DOO", "name": "Jack Doohan", "team": "Alpine"},
    10: {"tla": "GAS", "name": "Pierre Gasly", "team": "Alpine"},
    11: {"tla": "PER", "name": "Sergio Perez", "team": "Red Bull Racing"},
    12: {"tla": "ANT", "name": "Kimi Antonelli", "team": "Mercedes"},
    14: {"tla": "ALO", "name": "Fernando Alonso", "team": "Aston Martin"},
    16: {"tla": "LEC", "name": "Charles Leclerc", "team": "Ferrari"},
    18: {"tla": "STR", "name": "Lance Stroll", "team": "Aston Martin"},
    20: {"tla": "MAG", "name": "Kevin Magnussen", "team": "Haas F1 Team"},
    22: {"tla": "TSU", "name": "Yuki Tsunoda", "team": "RB"},
    23: {"tla": "ALB", "name": "Alexander Albon", "team": "Williams"},
    24: {"tla": "ZOU", "name": "Zhou Guanyu", "team": "Kick Sauber"},
    27: {"tla": "HUL", "name": "Nico Hulkenberg", "team": "Haas F1 Team"},
    30: {"tla": "LAW", "name": "Liam Lawson", "team": "RB"},
    31: {"tla": "OCO", "name": "Esteban Ocon", "team": "Haas F1 Team"},
    43: {"tla": "COL", "name": "Franco Colapinto", "team": "Williams"},
    44: {"tla": "HAM", "name": "Lewis Hamilton", "team": "Ferrari"},
    50: {"tla": "BEA", "name": "Oliver Bearman", "team": "Haas F1 Team"},
    55: {"tla": "SAI", "name": "Carlos Sainz", "team": "Williams"},
    63: {"tla": "RUS", "name": "George Russell", "team": "Mercedes"},
    77: {"tla": "BOT", "name": "Valtteri Bottas", "team": "Kick Sauber"},
    81: {"tla": "PIA", "name": "Oscar Piastri", "team": "McLaren"},
}

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

        driver_num_int = _as_int(dn, 0)
        fallback = DRIVER_INFO.get(driver_num_int, {})

        # Driver identity
        first_name = driver.get("FirstName", driver.get("first_name", ""))
        last_name = driver.get("LastName", driver.get("last_name", ""))
        full_name = f"{first_name} {last_name}".strip() or driver.get("FullName") or fallback.get("name") or f"Driver {dn}"
        tla = driver.get("Tla", driver.get("name_acronym")) or fallback.get("tla") or str(dn)
        team_name = driver.get("TeamName", driver.get("team_name")) or fallback.get("team") or ""
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
            "pos_diff": timing.get("PosDiff"),
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


# ─── Historical Session Loader ────────────────────────────────────────────────

_historical_loaded = False
_historical_session_info: Dict[str, Any] = {}


def load_latest_historical_session(data_store: LiveF1DataStore) -> bool:
    """
    Load the most recent completed session into the data store.
    Called as a fallback when no live session is streaming.
    Returns True if data was loaded successfully.
    """
    global _historical_loaded, _historical_session_info

    if _historical_loaded:
        return True

    try:
        import livef1
        import pandas as pd
    except ImportError as e:
        logger.error("livef1/pandas not available: %s", e)
        return False

    logger.info("Loading most recent historical session...")

    # Try 2026 Australian GP first, then fall back through recent years
    session = None
    meeting_name = ""
    _SESSION_SEARCH = [
        (2026, 1279, "Race"),       # 2026 Australian GP
        (2026, 1279, "Qualifying"),
        (2024, None, "Race"),       # Fallback: last race of 2024
        (2023, None, "Race"),
    ]

    for year, meeting_key_override, session_type in _SESSION_SEARCH:
        try:
            season = livef1.get_season(year)
            if not season.meetings:
                continue

            if meeting_key_override:
                # Find the specific meeting by key
                target = None
                for m in season.meetings:
                    if m.key == meeting_key_override:
                        target = m
                        break
                if not target:
                    continue
                meeting_name = getattr(target, "name", "")
                mk = target.key
            else:
                # Fall back to last meeting in season
                target = season.meetings[-1]
                meeting_name = getattr(target, "name", "")
                mk = target.key

            session = livef1.get_session(
                season=year,
                meeting_key=mk,
                session_identifier=session_type,
            )
            if session:
                logger.info("Loaded historical session: %s %s %d", meeting_name, session_type, year)
                break
        except Exception as exc:
            logger.warning("Failed to load %d/%s/%s: %s", year, meeting_key_override, session_type, exc)
            continue

    if not session:
        logger.warning("No historical session could be loaded.")
        return False

    # Process the session data using livef1's silver layer
    try:
        session.generate(silver=True)
    except Exception as exc:
        logger.warning("Silver generation failed, continuing with raw data: %s", exc)

    # ── Extract Laps Data ──────────────────────────────────────────────────
    try:
        laps_df = session.get_laps()
        if laps_df is not None and not laps_df.empty:
            driver_groups = laps_df.groupby("DriverNo")
            for driver_no, driver_laps in driver_groups:
                dn = str(int(driver_no)) if not isinstance(driver_no, str) else driver_no
                last_lap = driver_laps.iloc[-1]

                first_lap = driver_laps.iloc[0]
                start_pos = _safe_value(first_lap, "Position")
                curr_pos = _safe_value(last_lap, "Position")
                pos_diff = 0
                try:
                    if start_pos and curr_pos:
                        pos_diff = int(start_pos) - int(curr_pos) # Positive is positions gained
                except ValueError:
                    pass

                timing = {
                    "DriverNo": dn,
                    "Position": curr_pos,
                    "StartPos": start_pos,
                    "PosDiff": pos_diff,
                    "NumberOfLaps": _safe_value(last_lap, "LapNo", len(driver_laps)),
                    "LastLapTime_Value": _format_timedelta(last_lap, "LapTime"),
                    "Sectors_1_Value": _format_timedelta(last_lap, "Sector1_Time"),
                    "Sectors_2_Value": _format_timedelta(last_lap, "Sector2_Time"),
                    "Sectors_3_Value": _format_timedelta(last_lap, "Sector3_Time"),
                    "GapToLeader_Value": _safe_value(last_lap, "GapToLeader"),
                    "IntervalToPositionAhead_Value": _safe_value(last_lap, "IntervalToPositionAhead"),
                    "NumberOfPitStops": _safe_value(last_lap, "NoPits", 0),
                }
                data_store.update_timing([timing])

                compound = _safe_value(last_lap, "Compound", "Unknown")
                tire_age = _safe_value(last_lap, "TyreAge", 0)
                data_store.update_current_tyres([{
                    "DriverNo": dn, "Compound": compound, "TyreAge": tire_age,
                }])
            logger.info("Loaded %d drivers' lap data.", len(driver_groups))
    except Exception as exc:
        logger.warning("Failed to load laps data: %s", exc)

    # ── Extract Car Telemetry + Track Outline + Position Trails ─────────────
    try:
        telem_df = session.get_car_telemetry()
        if telem_df is not None and not telem_df.empty:
            # --- Track outline: one driver, one clean lap, downsampled ---
            try:
                leader_dn = str(int(telem_df["DriverNo"].mode().iloc[0]))
                leader_data = telem_df[telem_df["DriverNo"].astype(str) == leader_dn]
                # Pick a mid-race lap for a clean outline
                laps = leader_data["LapNo"].unique()
                mid_lap = laps[len(laps) // 2] if len(laps) > 2 else laps[0]
                one_lap = leader_data[leader_data["LapNo"] == mid_lap]

                if not one_lap.empty and "X" in one_lap.columns and "Y" in one_lap.columns:
                    coords = one_lap[["X", "Y"]].dropna()
                    # Downsample to ~200 points for smooth SVG
                    step = max(1, len(coords) // 200)
                    outline = coords.iloc[::step][["X", "Y"]].values.tolist()
                    # Convert numpy to float
                    outline = [[float(x), float(y)] for x, y in outline]
                    data_store.track_outline = outline
                    logger.info("Track outline extracted: %d points from lap %s", len(outline), mid_lap)
            except Exception as exc:
                logger.warning("Could not extract track outline: %s", exc)

            # --- Per-driver: last telemetry entry + position trail ---
            driver_groups = telem_df.groupby("DriverNo")
            for driver_no, driver_telem in driver_groups:
                dn = str(int(driver_no)) if not isinstance(driver_no, str) else driver_no
                last_entry = driver_telem.iloc[-1]

                car = {
                    "DriverNo": dn,
                    "speed": _safe_value(last_entry, "Speed", 0),
                    "rpm": _safe_value(last_entry, "RPM", 0),
                    "n_gear": _safe_value(last_entry, "GearNo", 0),
                    "throttle": _safe_value(last_entry, "Throttle", 0),
                    "brake": _safe_value(last_entry, "Brake", 0),
                    "drs": _safe_value(last_entry, "DRS", 0),
                    "Utc": str(_safe_value(last_entry, "Utc", "")),
                }
                data_store.update_car_data([car])

                pos_rec = {
                    "DriverNo": dn,
                    "X": _safe_value(last_entry, "X", 0),
                    "Y": _safe_value(last_entry, "Y", 0),
                    "Z": _safe_value(last_entry, "Z", 0),
                    "Status": "OnTrack",
                }
                data_store.update_positions([pos_rec])

                # Position trail (last 2 laps of positions for racing lines)
                if "X" in driver_telem.columns and "Y" in driver_telem.columns:
                    recent = driver_telem.tail(600)  # ~2 laps worth
                    step = max(1, len(recent) // 200)
                    trail = recent[["X", "Y"]].dropna().iloc[::step].values.tolist()
                    trail = [[float(x), float(y)] for x, y in trail]
                    with data_store._lock:
                        data_store.position_history[dn] = deque(trail, maxlen=300)

            logger.info("Loaded telemetry + trails for %d drivers.", len(driver_groups))
    except Exception as exc:
        logger.warning("Failed to load telemetry: %s", exc)

    # ── Extract Driver List from raw data ──────────────────────────────────
    try:
        driver_data = session.get_data(dataNames="DriverList")
        if driver_data is not None:
            raw = driver_data.value if hasattr(driver_data, "value") else driver_data
            if isinstance(raw, dict):
                for dn, info in raw.items():
                    if isinstance(info, dict):
                        info["RacingNumber"] = str(info.get("RacingNumber", dn))
                        data_store.update_drivers([info])
            elif isinstance(raw, list):
                for info in raw:
                    if isinstance(info, dict):
                        data_store.update_drivers([info])
            logger.info("Loaded driver list from historical session.")
    except Exception as exc:
        logger.warning("Failed to load driver list: %s", exc)

    # ── Extract Weather ────────────────────────────────────────────────────
    try:
        weather_raw = session.get_data(dataNames="WeatherData")
        if weather_raw is not None:
            raw = weather_raw.value if hasattr(weather_raw, "value") else weather_raw
            if isinstance(raw, dict):
                # Typically {timestamp: {AirTemp, TrackTemp, ...}, ...}
                last_entry = list(raw.values())[-1] if raw else {}
                if isinstance(last_entry, dict):
                    data_store.update_weather([last_entry])
            elif isinstance(raw, list) and raw:
                last_entry = raw[-1]
                if isinstance(last_entry, (list, tuple)) and len(last_entry) >= 2:
                    data_store.update_weather([last_entry[1]])
                elif isinstance(last_entry, dict):
                    data_store.update_weather([last_entry])
            logger.info("Loaded weather data from historical session.")
    except Exception as exc:
        logger.warning("Failed to load weather: %s", exc)

    # ── Extract Race Control Messages ──────────────────────────────────────
    try:
        rc_data = session.get_data(dataNames="RaceControlMessages")
        if rc_data is not None:
            raw = rc_data.value if hasattr(rc_data, "value") else rc_data
            if isinstance(raw, dict):
                messages = raw.get("Messages", {})
                if isinstance(messages, dict):
                    for msg in messages.values():
                        if isinstance(msg, dict):
                            data_store.update_race_control([msg])
                elif isinstance(messages, list):
                    for msg in messages:
                        if isinstance(msg, dict):
                            data_store.update_race_control([msg])
            logger.info("Loaded race control messages.")
    except Exception as exc:
        logger.warning("Failed to load race control: %s", exc)

    # ── Build session info ─────────────────────────────────────────────────
    meeting_obj = getattr(session, "_meeting", None) or getattr(session, "meeting", None)
    session_name = getattr(session, "name", getattr(session, "session_name", "Race"))

    circuit_info = {}
    country_info = {}
    meeting_info_name = meeting_name

    if meeting_obj:
        circuit_raw = getattr(meeting_obj, "circuit", None)
        if isinstance(circuit_raw, dict):
            circuit_info = circuit_raw
        country_raw = getattr(meeting_obj, "country", None)
        if isinstance(country_raw, dict):
            country_info = country_raw
        meeting_info_name = getattr(meeting_obj, "name", meeting_name)

    _historical_session_info.update({
        "Key": getattr(session, "key", None),
        "Name": session_name,
        "Type": session_name,
        "Meeting": {
            "Name": meeting_info_name,
            "OfficialName": getattr(meeting_obj, "officialname", meeting_info_name) if meeting_obj else meeting_info_name,
            "Circuit": circuit_info,
            "Country": country_info,
        },
        "StartDate": str(getattr(session, "start_date", "")),
        "EndDate": str(getattr(session, "end_date", "")),
        "_historical": True,
    })
    data_store.update_session_info([_historical_session_info])

    _historical_loaded = True
    logger.info("Historical session loaded successfully into data store.")
    return True


def _safe_value(row, col, default=None):
    """Safely extract a value from a pandas row or dict."""
    try:
        import pandas as pd
        val = row[col] if col in (row.index if hasattr(row, "index") else row) else default
        if pd.isna(val):
            return default
        # Convert numpy types to Python native
        if hasattr(val, "item"):
            return val.item()
        return val
    except Exception:
        return default


def _format_timedelta(row, col):
    """Format a timedelta column into a readable string like '1:23.456'."""
    try:
        import pandas as pd
        val = row[col] if col in (row.index if hasattr(row, "index") else row) else None
        if val is None or pd.isna(val):
            return None
        if isinstance(val, pd.Timedelta):
            total_seconds = val.total_seconds()
            if total_seconds <= 0:
                return None
            minutes = int(total_seconds // 60)
            seconds = total_seconds % 60
            if minutes > 0:
                return f"{minutes}:{seconds:06.3f}"
            return f"{seconds:.3f}"
        return str(val)
    except Exception:
        return None


def is_historical_mode() -> bool:
    """Check if we're displaying historical data (not live)."""
    return _historical_loaded and not _historical_session_info.get("_live_override")

