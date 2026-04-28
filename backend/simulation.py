"""
AI Strategy Engine — Premium features only (behind paywall).
Handles: pit stop projections, battery/ERS scenarios, yellow flag impact analysis.
This is NOT the live data source — live data comes from livef1_client.py.
"""

import random
from typing import Dict, List, Optional


def predict_pit_stop(
    driver_pos: int,
    driver_interval: Optional[float],
    all_cars: List[Dict],
    pit_loss_seconds: float = 22.0,
) -> Dict:
    """
    Given the current race state, predict where a driver would re-enter
    if they pit right now, accounting for ~22s pit loss.
    """
    # Find the driver
    target = None
    for car in all_cars:
        if car.get("pos") == driver_pos:
            target = car
            break

    if not target:
        return {"predicted_position": driver_pos, "positions_lost": 0}

    # Estimate: each car behind is ~interval seconds behind.
    # If we lose pit_loss_seconds, count how many cars would pass us.
    positions_lost = 0
    for car in all_cars:
        if car.get("pos", 999) > driver_pos:
            # Car is behind us. Would it end up ahead after our pit?
            try:
                their_gap = float(car.get("gap_to_leader") or car.get("interval") or 999)
                our_gap = float(target.get("gap_to_leader") or target.get("interval") or 0)
                if their_gap < our_gap + pit_loss_seconds:
                    positions_lost += 1
            except (ValueError, TypeError):
                continue

    predicted = driver_pos + positions_lost
    return {
        "predicted_position": min(predicted, len(all_cars)),
        "positions_lost": positions_lost,
        "pit_loss": pit_loss_seconds,
    }


def predict_yellow_flag_impact(all_cars: List[Dict]) -> Dict:
    """
    Predict how a safety car / yellow flag would compress the field.
    Shows who benefits and who loses out.
    """
    beneficiaries = []
    losers = []

    for car in all_cars:
        pos = car.get("pos", 0)
        tire_age = car.get("tire_age", 0)
        tire = car.get("tire", "Unknown")

        # Cars on old tires benefit from a free pit stop under SC
        if tire_age > 15:
            beneficiaries.append({
                "driver": car.get("id", "???"),
                "reason": f"Free pit stop — {tire} tires are {tire_age} laps old",
                "pos": pos,
            })
        # Cars that just pitted lose their advantage
        elif tire_age < 3 and pos > 5:
            losers.append({
                "driver": car.get("id", "???"),
                "reason": f"Just pitted — fresh {tire} advantage wiped out",
                "pos": pos,
            })

    return {
        "beneficiaries": beneficiaries[:5],
        "losers": losers[:5],
        "field_compression": "Gaps reset to ~1s between all cars under SC",
    }


def predict_ers_impact(driver_id: str, ers_level: int, laps_remaining: int) -> Dict:
    """
    Predict how ERS battery reserves will impact the rest of the race.
    2026 regs: 50/50 ICE/ERS power split — battery management is critical.
    """
    if ers_level > 70:
        outlook = "Strong reserves — can deploy aggressively for overtakes"
        risk = "Low"
    elif ers_level > 40:
        outlook = "Balanced — needs to manage deployment in slow corners"
        risk = "Medium"
    else:
        outlook = "Critical — will lose significant straight-line speed"
        risk = "High"

    deploy_per_lap = max(1, ers_level / max(laps_remaining, 1))

    return {
        "driver": driver_id,
        "ers_level": ers_level,
        "laps_remaining": laps_remaining,
        "deploy_per_lap": round(deploy_per_lap, 1),
        "outlook": outlook,
        "risk": risk,
    }


def predict_overtake(
    driver: Dict,
    target: Dict,
    all_cars: List[Dict],
) -> Dict:
    """
    Heuristic estimate of how many laps it would take the given driver
    to catch and pass the target ahead of them, based on pace delta
    and DRS availability.
    """
    driver_name = driver.get("name", driver.get("id", "Driver"))
    target_name = target.get("name", target.get("id", "Target"))
    driver_pos = driver.get("pos", 99)
    target_pos = target.get("pos", 98)

    # Parse MM:SS.mmm format if needed
    def parse_lap_time(t: any) -> float:
        if isinstance(t, (int, float)):
            return float(t)
        s = str(t).strip()
        if ":" in s:
            parts = s.split(":")
            try:
                return int(parts[0]) * 60 + float(parts[1])
            except (ValueError, IndexError):
                pass
        try:
            return float(s)
        except (ValueError, TypeError):
            return 90.0

    driver_lap = parse_lap_time(driver.get("best_lap_time") or driver.get("last_lap_time") or 90.5)
    target_lap = parse_lap_time(target.get("best_lap_time") or target.get("last_lap_time") or 90.5)

    pace_delta = target_lap - driver_lap  # positive = driver is faster per lap

    # Current on-track gap in seconds
    try:
        gap_to_leader_driver = float(driver.get("gap_to_leader") or 0)
        gap_to_leader_target = float(target.get("gap_to_leader") or 0)
        gap_seconds = abs(gap_to_leader_driver - gap_to_leader_target)
    except (ValueError, TypeError):
        gap_seconds = 3.0

    if gap_seconds < 0.5:
        gap_seconds = 0.5

    # DRS boost: if within 1 second after catching, add 0.4s pace bonus
    drs_available = bool(driver.get("drs", 0) and int(driver.get("drs", 0)) > 10)
    drs_bonus = 0.4 if drs_available else 0.0
    effective_delta = pace_delta + drs_bonus

    if effective_delta <= 0:
        laps_to_catch = None
        assessment = "Pace delta insufficient — overtake unlikely without a strategic intervention."
    else:
        laps_to_catch = round(gap_seconds / effective_delta, 1)
        if laps_to_catch <= 3:
            assessment = "Imminent — expect an overtake attempt within 2–3 laps."
        elif laps_to_catch <= 8:
            assessment = "Close battle ahead — should be in DRS range soon."
        else:
            assessment = "Long game — tire delta or a safety car will be needed."

    return {
        "driver": driver_name,
        "driver_pos": driver_pos,
        "target": target_name,
        "target_pos": target_pos,
        "gap_seconds": round(gap_seconds, 2),
        "pace_delta_per_lap": round(effective_delta, 3),
        "drs_available": drs_available,
        "laps_to_catch": laps_to_catch,
        "assessment": assessment,
    }


TIRE_LIFE: Dict[str, int] = {
    "SOFT": 25,
    "MEDIUM": 40,
    "HARD": 55,
    "INTER": 35,
    "WET": 40,
}

TIRE_PACE_OFFSET: Dict[str, float] = {
    "SOFT": 0.0,
    "MEDIUM": 0.4,
    "HARD": 0.8,
    "INTER": 1.5,
    "WET": 3.0,
}


def predict_tire_strategy(
    driver: Dict,
    laps_remaining: int,
    weather_temp: float = 30.0,
) -> Dict:
    """
    Recommend a pit-stop window and target compound for the driver,
    based on current tire age, compound, laps remaining, and track temp.
    """
    driver_name = driver.get("name", driver.get("id", "Driver"))
    compound = (driver.get("tire") or "MEDIUM").upper()
    tire_age = int(driver.get("tire_age") or 0)

    max_life = TIRE_LIFE.get(compound, 35)

    # Heat degrades tires faster — above 40°C, reduce life by up to 20%
    temp_factor = 1.0 - max(0, (weather_temp - 40) / 100)
    adjusted_life = int(max_life * temp_factor)

    laps_left_on_tire = max(0, adjusted_life - tire_age)

    # Decide urgency
    if laps_left_on_tire == 0:
        urgency = "CRITICAL"
        pit_in_laps = 1
    elif laps_left_on_tire <= 5:
        urgency = "HIGH"
        pit_in_laps = laps_left_on_tire
    elif laps_left_on_tire <= 12:
        urgency = "MEDIUM"
        pit_in_laps = laps_left_on_tire
    else:
        urgency = "LOW"
        pit_in_laps = laps_left_on_tire

    # Recommend next compound
    if laps_remaining <= 15:
        recommended = "SOFT"
    elif compound == "SOFT":
        recommended = "MEDIUM" if laps_remaining > 20 else "SOFT"
    elif compound == "MEDIUM":
        recommended = "HARD" if laps_remaining > 30 else "MEDIUM"
    else:
        recommended = "MEDIUM" if compound in ("INTER", "WET") else "SOFT"

    next_life = int(TIRE_LIFE.get(recommended, 35) * temp_factor)
    two_stop = next_life < laps_remaining
    strategy_label = "2-stop" if two_stop else "1-stop"

    return {
        "driver": driver_name,
        "current_compound": compound,
        "tire_age": tire_age,
        "laps_remaining": laps_remaining,
        "laps_left_on_tire": laps_left_on_tire,
        "pit_in_laps": pit_in_laps,
        "urgency": urgency,
        "recommended_compound": recommended,
        "strategy": strategy_label,
        "weather_temp": weather_temp,
    }
