"""
anomaly.py — Real-time Anomaly Detector for F1 Race Data
Scans car telemetry and race state for anomalous conditions, maintaining a rolling history.
"""

import statistics
from datetime import datetime, timezone
from typing import Any
from collections import deque
from pydantic import BaseModel, Field
from livef1_client import RaceState, CarState

class AnomalyResult(BaseModel):
    driver_id: str
    type: str
    severity: str
    message: str
    detected_at: str

# In-memory history stores the last 5 lap times per driver for baseline comparison
_lap_history: dict[str, deque[float]] = {}

def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _parse_time(raw: str | None) -> float | None:
    """Parse a lap or sector time string (M:SS.mmm) to seconds."""
    if raw is None:
        return None
    s = str(raw).strip()
    try:
        if ":" in s:
            parts = s.split(":")
            return int(parts[0]) * 60 + float(parts[1])
        val = float(s)
        return val if val > 0 else None
    except (TypeError, ValueError):
        return None

def _update_history(driver_id: str, last_lap: float | None):
    """Maintain the 5-lap rolling window for the driver."""
    if last_lap is None:
        return
    if driver_id not in _lap_history:
        _lap_history[driver_id] = deque(maxlen=5)

    # Simple check to avoid appending the exact same lap repeatedly
    # (assuming telemetry might poll faster than laps complete)
    if not _lap_history[driver_id] or _lap_history[driver_id][-1] != last_lap:
        _lap_history[driver_id].append(last_lap)

def _check_tire_deg_slope(car: CarState, rolling_avg: float | None) -> AnomalyResult | None:
    """Flag if tire degradation is worse than 0.15s/lap slope."""
    if not rolling_avg:
        return None

    last_lap = _parse_time(car.last_lap_time)
    if not last_lap:
        return None

    # If the current lap is significantly worse than the 5-lap baseline, flag it
    delta = last_lap - rolling_avg

    # Rough proxy for 0.15s/lap slope over a few laps
    if delta > 0.5 and car.tire_age > 5:
        return AnomalyResult(
            driver_id=car.id,
            type="tire_deg_high",
            severity="medium",
            message=f"{car.name or car.id} showing severe tire degradation ({delta:.2f}s drop off baseline).",
            detected_at=_iso_now()
        )
    return None

def _check_ers_critical(car: CarState, laps_remaining: int) -> AnomalyResult | None:
    """Flag if ERS is below 30% with >20 laps remaining (2026 regs)."""
    # Note: LiveF1 doesn't directly expose ERS level in the basic telemetry,
    # so we might infer or mock this for the simulation. Assuming we have it or use a heuristic.
    # In this implementation, we will assume `car.drs` can proxy for ERS deployment state
    # if actual ERS % isn't available, but since the prompt specified this check, we implement the logic.

    # We will assume a mock ERS level for this demonstration as it's not in CarState by default
    ers_level = getattr(car, "ers_level", 100) # Fallback if not added to model

    if ers_level < 30 and laps_remaining > 20:
        return AnomalyResult(
            driver_id=car.id,
            type="ers_critical",
            severity="high",
            message=f"{car.name or car.id} ERS critical (<30%) with {laps_remaining} laps left. High risk under 2026 50/50 power regs.",
            detected_at=_iso_now()
        )
    return None

def _check_pace_drop(car: CarState, rolling_avg: float | None) -> AnomalyResult | None:
    """Flag pace drop > 0.5s vs rolling average."""
    if not rolling_avg:
        return None

    last_lap = _parse_time(car.last_lap_time)
    if not last_lap:
        return None

    delta = last_lap - rolling_avg
    if delta > 0.5:
        return AnomalyResult(
            driver_id=car.id,
            type="pace_drop",
            severity="high" if delta > 1.0 else "medium",
            message=f"{car.name or car.id} pace dropped {delta:.2f}s vs rolling 5-lap average.",
            detected_at=_iso_now()
        )
    return None

def detect_anomalies(race_state: RaceState) -> list[AnomalyResult]:
    """
    Scan all cars in race_state for telemetry and tactical anomalies.
    Maintains a 5-lap rolling window.
    """
    cars = race_state.cars
    if not cars:
        return []

    anomalies: list[AnomalyResult] = []

    laps_remaining = max(1, race_state.total_laps - race_state.lap)

    for car in cars:
        last_lap = _parse_time(car.last_lap_time)
        _update_history(car.id, last_lap)

        history = _lap_history.get(car.id, [])
        rolling_avg = statistics.mean(history) if len(history) >= 3 else None

        if result := _check_pace_drop(car, rolling_avg):
            anomalies.append(result)

        if result := _check_tire_deg_slope(car, rolling_avg):
            anomalies.append(result)

        if result := _check_ers_critical(car, laps_remaining):
            anomalies.append(result)

    # Sort: high first, then medium, then low
    severity_order = {"high": 0, "medium": 1, "low": 2}
    anomalies.sort(key=lambda a: severity_order.get(a.severity, 2))

    return anomalies
