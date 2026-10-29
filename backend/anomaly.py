"""
anomaly.py — Real-time Anomaly Detector for F1 Race Data
Scans car telemetry and race state for anomalous conditions.
"""

import statistics
from datetime import datetime, timezone
from typing import Optional


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_float(val, default: float = 0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _parse_sector_time(raw) -> float | None:
    """Parse sector time string or float to seconds. Returns None if unparseable."""
    if raw is None:
        return None
    s = str(raw).strip()
    try:
        if ":" in s:
            parts = s.split(":")
            total = 0.0
            for p in parts:
                total = total * 60 + float(p)
            return total
        val = float(s)
        return val if val > 0 else None
    except (TypeError, ValueError):
        return None


# ─────────────────────────────────────────────────────────────
#  Individual anomaly checks
# ─────────────────────────────────────────────────────────────

def _check_speed_dropoff(car: dict, avg_speed: float) -> dict | None:
    """(a) Speed dropoff vs grid average > 30 km/h."""
    speed = _safe_float(car.get("speed"))
    if speed <= 0:
        return None
    if avg_speed > 0 and (avg_speed - speed) > 30:
        delta = round(avg_speed - speed, 1)
        return {
            "driver_id": str(car.get("id", car.get("number", "?"))),
            "type": "speed_dropoff",
            "severity": "high" if delta > 60 else "medium",
            "message": (
                f"{car.get('name', car.get('id', 'Unknown'))} running {delta} km/h below grid average "
                f"({speed:.0f} vs {avg_speed:.0f} km/h) — possible mechanical issue or slow zone."
            ),
            "detected_at": _iso_now(),
        }
    return None


def _check_tire_age(car: dict) -> dict | None:
    """(b) Tire age > 35 laps without pit."""
    tire_age = int(_safe_float(car.get("tire_age"), 0))
    if tire_age > 35:
        return {
            "driver_id": str(car.get("id", car.get("number", "?"))),
            "type": "tire_age_critical",
            "severity": "high" if tire_age > 45 else "medium",
            "message": (
                f"{car.get('name', car.get('id', 'Unknown'))} on {tire_age}-lap-old "
                f"{car.get('tire', 'UNKNOWN')} tires without a pit stop — cliff degradation risk."
            ),
            "detected_at": _iso_now(),
        }
    return None


def _check_sector3(car: dict, median_s3: float | None) -> dict | None:
    """(c) Sector 3 time > 1.15× median across grid."""
    if median_s3 is None or median_s3 <= 0:
        return None
    s3 = _parse_sector_time(car.get("sector_3") or car.get("sector3"))
    if s3 is None or s3 <= 0:
        return None
    threshold = median_s3 * 1.15
    if s3 > threshold:
        pct = round((s3 / median_s3 - 1) * 100, 1)
        return {
            "driver_id": str(car.get("id", car.get("number", "?"))),
            "type": "sector3_slow",
            "severity": "medium" if pct < 25 else "high",
            "message": (
                f"{car.get('name', car.get('id', 'Unknown'))} sector 3 time {s3:.3f}s is "
                f"{pct}% slower than grid median ({median_s3:.3f}s) — possible snap/lock-up or traffic."
            ),
            "detected_at": _iso_now(),
        }
    return None


def _check_drs_anomaly(car: dict) -> dict | None:
    """(d) DRS active when gap-to-ahead > 1.0s (anomalous — DRS should only open within 1s)."""
    drs_raw = car.get("drs")
    if not drs_raw:
        return None
    drs_active = str(drs_raw).strip().upper() in ("1", "TRUE", "OPEN", "ENABLED", "ON", "10", "12", "14")
    if not drs_active:
        return None

    interval_raw = car.get("interval") or car.get("gap_ahead")
    if interval_raw is None:
        return None
    interval_str = str(interval_raw).replace("+", "").replace("s", "").strip()
    try:
        interval = float(interval_str)
    except (ValueError, TypeError):
        return None

    if interval > 1.0:
        return {
            "driver_id": str(car.get("id", car.get("number", "?"))),
            "type": "drs_anomaly",
            "severity": "low",
            "message": (
                f"{car.get('name', car.get('id', 'Unknown'))} DRS appears active with "
                f"{interval:.3f}s gap to car ahead — outside normal 1.0s DRS detection zone."
            ),
            "detected_at": _iso_now(),
        }
    return None


def _check_gear_stuck(car: dict) -> dict | None:
    """(e) Gear stuck < 3 while throttle > 50%."""
    gear_raw = car.get("gear") or car.get("n_gear")
    throttle_raw = car.get("throttle")
    if gear_raw is None or throttle_raw is None:
        return None
    try:
        gear = int(float(gear_raw))
        throttle = float(throttle_raw)
    except (ValueError, TypeError):
        return None

    if gear < 3 and throttle > 50:
        return {
            "driver_id": str(car.get("id", car.get("number", "?"))),
            "type": "gear_stuck",
            "severity": "high",
            "message": (
                f"{car.get('name', car.get('id', 'Unknown'))} stuck in gear {gear} "
                f"with {throttle:.0f}% throttle — possible gearbox failure."
            ),
            "detected_at": _iso_now(),
        }
    return None


# ─────────────────────────────────────────────────────────────
#  Main entry point
# ─────────────────────────────────────────────────────────────

def detect_anomalies(
    race_state: dict,
    history: list[dict] | None = None,
) -> list[dict]:
    """
    Scan all cars in race_state for telemetry and tactical anomalies.

    Checks performed:
      (a) Speed dropoff > 30 km/h below grid average
      (b) Tire age > 35 laps without pit stop
      (c) Sector 3 time > 1.15× grid median
      (d) DRS active with gap-to-ahead > 1.0s
      (e) Gear < 3 while throttle > 50%

    Args:
        race_state: Current race state dict (must contain "cars" list).
        history: Optional list of prior race state snapshots (reserved for future use).

    Returns:
        List of anomaly dicts, each with keys:
        driver_id, type, severity, message, detected_at.
    """
    cars = race_state.get("cars", [])
    if not cars:
        return []

    anomalies: list[dict] = []

    # Pre-compute grid-wide aggregates for relative checks
    speeds = [_safe_float(c.get("speed")) for c in cars if _safe_float(c.get("speed")) > 0]
    avg_speed = statistics.mean(speeds) if speeds else 0.0

    sector3_times = [
        t for c in cars
        for t in [_parse_sector_time(c.get("sector_3") or c.get("sector3"))]
        if t is not None and t > 0
    ]
    median_s3 = statistics.median(sector3_times) if len(sector3_times) >= 3 else None

    for car in cars:
        # (a) Speed dropoff
        result = _check_speed_dropoff(car, avg_speed)
        if result:
            anomalies.append(result)

        # (b) Tire age
        result = _check_tire_age(car)
        if result:
            anomalies.append(result)

        # (c) Sector 3 slow
        result = _check_sector3(car, median_s3)
        if result:
            anomalies.append(result)

        # (d) DRS anomaly
        result = _check_drs_anomaly(car)
        if result:
            anomalies.append(result)

        # (e) Gear stuck
        result = _check_gear_stuck(car)
        if result:
            anomalies.append(result)

    # Sort: high first, then medium, then low
    severity_order = {"high": 0, "medium": 1, "low": 2}
    anomalies.sort(key=lambda a: severity_order.get(a.get("severity", "low"), 2))

    return anomalies
