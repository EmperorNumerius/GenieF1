"""
monte_carlo.py — Monte Carlo Race Outcome Predictor
Simulates race finishing positions based on current car data.
"""

import random
import statistics
from typing import Optional
from pydantic import BaseModel
from livef1_client import RaceState, CarState

class MonteCarloPrediction(BaseModel):
    id: str
    name: str
    win_probability: float
    podium_probability: float
    expected_position: float
    p10: int
    p90: int

class MonteCarloResult(BaseModel):
    laps_simulated: int
    simulations: int
    predictions: list[MonteCarloPrediction]

TIRE_DEG_RATES: dict[str, float] = {
    "SOFT": 0.040,
    "MEDIUM": 0.025,
    "HARD": 0.015,
    "INTERMEDIATE": 0.020,
    "WET": 0.018,
}

DEFAULT_DEG_RATE = 0.025
DEFAULT_LAP_TIME = 95.0
PIT_STOP_LOSS = 22.0
PIT_THRESHOLD = 25
LAP_NOISE_SIGMA = 0.4

def _parse_lap_time(raw: str | None) -> float:
    if raw is None:
        return DEFAULT_LAP_TIME
    s = str(raw).strip()
    try:
        if ":" in s:
            mins, rest = s.split(":", 1)
            return int(mins) * 60 + float(rest)
        val = float(s)
        return val if 60.0 <= val <= 200.0 else DEFAULT_LAP_TIME
    except (ValueError, TypeError):
        return DEFAULT_LAP_TIME

def _deg_rate(tire_compound: str) -> float:
    return TIRE_DEG_RATES.get(tire_compound.upper(), DEFAULT_DEG_RATE)

def _simulate_one_run(
    cars: list[CarState],
    laps_remaining: int,
    rng: random.Random,
) -> list[tuple[str, float]]:
    results = []

    for car in cars:
        base_lap_time = _parse_lap_time(car.last_lap_time)
        tire_age = car.tire_age
        compound = car.tire or "MEDIUM"
        deg = _deg_rate(compound)

        cumulative_time = 0.0
        current_tire_age = tire_age
        pitted = False

        for lap in range(laps_remaining):
            if not pitted and current_tire_age > PIT_THRESHOLD:
                cumulative_time += PIT_STOP_LOSS
                current_tire_age = 0
                deg = DEFAULT_DEG_RATE
                pitted = True

            deg_penalty = deg * current_tire_age
            noise = rng.gauss(0.0, LAP_NOISE_SIGMA)
            lap_time = base_lap_time + deg_penalty + noise
            lap_time = max(lap_time, base_lap_time * 0.90)

            cumulative_time += lap_time
            current_tire_age += 1

        results.append((car.id, cumulative_time))

    results.sort(key=lambda x: x[1])
    return results

def simulate_race_outcomes(
    race_state: RaceState,
    n_simulations: int = 1000,
    laps_remaining: int | None = None,
) -> MonteCarloResult:
    cars = race_state.cars
    if not cars:
        return MonteCarloResult(laps_simulated=0, simulations=n_simulations, predictions=[])

    if laps_remaining is None:
        laps_remaining = max(1, race_state.total_laps - race_state.lap)
        if laps_remaining <= 0:
            laps_remaining = 20

    laps_remaining = max(1, laps_remaining)
    n_simulations = max(1, min(n_simulations, 10_000))

    positions_per_car: dict[str, list[int]] = {car.id: [] for car in cars}
    rng = random.Random()

    for _ in range(n_simulations):
        run_results = _simulate_one_run(cars, laps_remaining, rng)
        for finishing_pos, (car_id, _) in enumerate(run_results, start=1):
            if car_id in positions_per_car:
                positions_per_car[car_id].append(finishing_pos)

    predictions = []
    for car in cars:
        pos_list = positions_per_car[car.id]
        if not pos_list:
            continue

        n = len(pos_list)
        win_prob = sum(1 for p in pos_list if p == 1) / n
        podium_prob = sum(1 for p in pos_list if p <= 3) / n
        expected_pos = statistics.mean(pos_list)

        sorted_pos = sorted(pos_list)
        p10_idx = max(0, int(0.10 * n) - 1)
        p90_idx = min(n - 1, int(0.90 * n))

        predictions.append(
            MonteCarloPrediction(
                id=car.id,
                name=car.name or car.id,
                win_probability=round(win_prob, 4),
                podium_probability=round(podium_prob, 4),
                expected_position=round(expected_pos, 2),
                p10=sorted_pos[p10_idx],
                p90=sorted_pos[p90_idx],
            )
        )

    predictions.sort(key=lambda x: (-x.win_probability, x.expected_position))

    return MonteCarloResult(
        laps_simulated=laps_remaining,
        simulations=n_simulations,
        predictions=predictions,
    )
