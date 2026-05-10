"""
AI Strategy Engine — Premium features only (behind paywall).
Handles: pit stop projections, battery/ERS scenarios, yellow flag impact analysis.
Uses LiveF1 data store for calculations.
"""

from typing import Any
from pydantic import BaseModel
from livef1_client import CarState, RaceState

class PitProjectionResult(BaseModel):
    predicted_position: int
    positions_lost: int
    pit_loss: float

class YellowFlagResult(BaseModel):
    beneficiaries: list[dict[str, Any]]
    losers: list[dict[str, Any]]
    field_compression: str

class ERSPredictionResult(BaseModel):
    driver: str
    ers_level: int
    laps_remaining: int
    deploy_per_lap: float
    outlook: str
    risk: str

class OvertakeSimulationResult(BaseModel):
    driver: str
    driver_pos: int
    target: str
    target_pos: int
    gap_seconds: float
    pace_delta_per_lap: float
    drs_available: bool
    laps_to_catch: float | None
    assessment: str

class TireStrategyResult(BaseModel):
    driver: str
    current_compound: str
    tire_age: int
    laps_remaining: int
    laps_left_on_tire: int
    pit_in_laps: int
    urgency: str
    recommended_compound: str
    strategy: str
    weather_temp: float


def predict_pit_stop(
    driver_pos: int,
    driver_interval: float | None,
    all_cars: list[CarState],
    pit_loss_seconds: float = 22.0,
) -> PitProjectionResult:
    """
    Predict where a driver would re-enter if they pit right now.
    """
    target = None
    for car in all_cars:
        if car.pos == driver_pos:
            target = car
            break

    if not target:
        return PitProjectionResult(
            predicted_position=driver_pos,
            positions_lost=0,
            pit_loss=pit_loss_seconds
        )

    positions_lost = 0
    for car in all_cars:
        if car.pos > driver_pos:
            try:
                their_gap = float(car.gap_to_leader or car.interval or 999)
                our_gap = float(target.gap_to_leader or target.interval or 0)
                if their_gap < our_gap + pit_loss_seconds:
                    positions_lost += 1
            except (ValueError, TypeError):
                continue

    predicted = min(driver_pos + positions_lost, len(all_cars))
    return PitProjectionResult(
        predicted_position=predicted,
        positions_lost=positions_lost,
        pit_loss=pit_loss_seconds
    )


def predict_yellow_flag_impact(all_cars: list[CarState]) -> YellowFlagResult:
    """
    Predict how a safety car / yellow flag would compress the field.
    """
    beneficiaries = []
    losers = []

    for car in all_cars:
        pos = car.pos
        tire_age = car.tire_age
        tire = car.tire

        if tire_age > 15:
            beneficiaries.append({
                "driver": car.id,
                "reason": f"Free pit stop — {tire} tires are {tire_age} laps old",
                "pos": pos,
            })
        elif tire_age < 3 and pos > 5:
            losers.append({
                "driver": car.id,
                "reason": f"Just pitted — fresh {tire} advantage wiped out",
                "pos": pos,
            })

    return YellowFlagResult(
        beneficiaries=beneficiaries[:5],
        losers=losers[:5],
        field_compression="Gaps reset to ~1s between all cars under SC",
    )


def predict_ers_impact(driver_id: str, ers_level: int, laps_remaining: int) -> ERSPredictionResult:
    """
    Predict ERS battery reserves impact (2026 regs 50/50 split).
    """
    if ers_level > 70:
        outlook = "Strong reserves — can deploy aggressively for overtakes (OVR mode)"
        risk = "Low"
    elif ers_level > 40:
        outlook = "Balanced — needs to manage deployment in slow corners"
        risk = "Medium"
    else:
        outlook = "Critical — will lose significant straight-line speed (50% power drop)"
        risk = "High"

    deploy_per_lap = max(1.0, float(ers_level) / max(laps_remaining, 1))

    return ERSPredictionResult(
        driver=driver_id,
        ers_level=ers_level,
        laps_remaining=laps_remaining,
        deploy_per_lap=round(deploy_per_lap, 1),
        outlook=outlook,
        risk=risk,
    )


def predict_overtake(
    driver: CarState,
    target: CarState,
    all_cars: list[CarState],
) -> OvertakeSimulationResult:
    """
    Estimate laps to catch and pass target based on pace delta.
    """
    def parse_lap_time(t: Any) -> float:
        if isinstance(t, (int, float)):
            return float(t)
        if t is None:
            return 90.0
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

    driver_lap = parse_lap_time(driver.best_lap_time or driver.last_lap_time or 90.5)
    target_lap = parse_lap_time(target.best_lap_time or target.last_lap_time or 90.5)

    pace_delta = target_lap - driver_lap

    try:
        gap_to_leader_driver = float(driver.gap_to_leader or 0)
        gap_to_leader_target = float(target.gap_to_leader or 0)
        gap_seconds = abs(gap_to_leader_driver - gap_to_leader_target)
    except (ValueError, TypeError):
        gap_seconds = 3.0

    gap_seconds = max(0.5, gap_seconds)

    # OVR (Overtake Mode - 2026 regs) available when close
    drs_available = gap_seconds < 1.0
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
            assessment = "Close battle ahead — should be in OVR range soon."
        else:
            assessment = "Long game — tire delta or a safety car will be needed."

    return OvertakeSimulationResult(
        driver=driver.name or driver.id,
        driver_pos=driver.pos,
        target=target.name or target.id,
        target_pos=target.pos,
        gap_seconds=round(gap_seconds, 2),
        pace_delta_per_lap=round(effective_delta, 3),
        drs_available=drs_available,
        laps_to_catch=laps_to_catch,
        assessment=assessment,
    )


TIRE_LIFE: dict[str, int] = {
    "SOFT": 25,
    "MEDIUM": 40,
    "HARD": 55,
    "INTER": 35,
    "WET": 40,
}

def predict_tire_strategy(
    driver: CarState,
    laps_remaining: int,
    weather_temp: float = 30.0,
) -> TireStrategyResult:
    """
    Recommend a pit-stop window and target compound.
    """
    compound = (driver.tire or "MEDIUM").upper()
    tire_age = driver.tire_age

    max_life = TIRE_LIFE.get(compound, 35)

    temp_factor = 1.0 - max(0.0, (weather_temp - 40) / 100)
    adjusted_life = int(max_life * temp_factor)

    laps_left_on_tire = max(0, adjusted_life - tire_age)

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

    return TireStrategyResult(
        driver=driver.name or driver.id,
        current_compound=compound,
        tire_age=tire_age,
        laps_remaining=laps_remaining,
        laps_left_on_tire=laps_left_on_tire,
        pit_in_laps=pit_in_laps,
        urgency=urgency,
        recommended_compound=recommended,
        strategy=strategy_label,
        weather_temp=weather_temp,
    )
