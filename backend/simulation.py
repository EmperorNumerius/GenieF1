"""
AI Strategy Engine — Premium features only (behind paywall).
Handles: pit stop projections, battery/ERS scenarios, yellow flag impact analysis.
This is NOT the live data source — live data comes from openf1_client.py.
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
