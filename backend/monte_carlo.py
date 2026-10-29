"""
monte_carlo.py — Monte Carlo Race Outcome Predictor
Simulates race finishing positions based on current car data.
"""

import random
import statistics
from typing import Optional


# Tire degradation coefficients: seconds added per lap of tire age
TIRE_DEG_RATES: dict[str, float] = {
    "SOFT": 0.040,
    "MEDIUM": 0.025,
    "HARD": 0.015,
    "INTERMEDIATE": 0.020,
    "WET": 0.018,
}

DEFAULT_DEG_RATE = 0.025
DEFAULT_LAP_TIME = 95.0  # seconds — fallback when no timing data

PIT_STOP_LOSS = 22.0    # seconds lost in a pit stop
PIT_THRESHOLD = 25      # laps — pit if tire_age exceeds this
LAP_NOISE_SIGMA = 0.4   # gaussian noise per lap in seconds


def _parse_lap_time(raw) -> float:
    """Convert 'M:SS.mmm' or seconds-float to total seconds. Returns DEFAULT_LAP_TIME on failure."""
    if raw is None:
        return DEFAULT_LAP_TIME
    s = str(raw).strip()
    try:
        if ":" in s:
            mins, rest = s.split(":", 1)
            return int(mins) * 60 + float(rest)
        val = float(s)
        # Sanity check: lap times in F1 are 60–200 seconds
        return val if 60.0 <= val <= 200.0 else DEFAULT_LAP_TIME
    except (ValueError, TypeError):
        return DEFAULT_LAP_TIME


def _deg_rate(tire_compound: str | None) -> float:
    """Return degradation rate for a given tire compound."""
    if not tire_compound:
        return DEFAULT_DEG_RATE
    return TIRE_DEG_RATES.get(str(tire_compound).upper(), DEFAULT_DEG_RATE)


def _simulate_one_run(
    cars: list[dict],
    laps_remaining: int,
    rng: random.Random,
) -> list[tuple[str, float]]:
    """
    Run a single Monte Carlo simulation.

    Returns a list of (car_id, total_race_time_seconds) sorted ascending.
    """
    results = []

    for car in cars:
        car_id = str(car.get("id", car.get("number", "?")))
        base_lap_time = _parse_lap_time(car.get("last_lap_time"))
        tire_age = int(car.get("tire_age") or 0)
        compound = car.get("tire") or car.get("compound") or "MEDIUM"
        deg = _deg_rate(compound)

        cumulative_time = 0.0
        current_tire_age = tire_age
        pitted = False

        for lap in range(laps_remaining):
            # Pit stop logic: stop once if tire is old
            if not pitted and current_tire_age > PIT_THRESHOLD:
                cumulative_time += PIT_STOP_LOSS
                current_tire_age = 0
                # After pit: switch to MEDIUM degradation as a generic assumption
                deg = DEFAULT_DEG_RATE
                pitted = True

            # Lap time = base + degradation penalty + gaussian noise
            deg_penalty = deg * current_tire_age
            noise = rng.gauss(0.0, LAP_NOISE_SIGMA)
            lap_time = base_lap_time + deg_penalty + noise
            # Clamp to avoid physically impossible laps
            lap_time = max(lap_time, base_lap_time * 0.90)

            cumulative_time += lap_time
            current_tire_age += 1

        results.append((car_id, cumulative_time))

    # Sort by total race time ascending (best time = P1)
    results.sort(key=lambda x: x[1])
    return results


def simulate_race_outcomes(
    race_state: dict,
    n_simulations: int = 1000,
    laps_remaining: int | None = None,
) -> dict:
    """
    Run Monte Carlo simulation of remaining race laps.

    Args:
        race_state: Current race state dict (must contain "cars" list).
        n_simulations: Number of simulation iterations.
        laps_remaining: Override laps remaining; auto-detected from race_state if None.

    Returns:
        {
            "laps_simulated": int,
            "simulations": int,
            "predictions": [
                {
                    "id": str,
                    "name": str,
                    "win_probability": float,
                    "podium_probability": float,
                    "expected_position": float,
                    "p10": int,   # 10th-percentile finishing position
                    "p90": int,   # 90th-percentile finishing position
                }
                ...
            ]   # sorted by win_probability descending
        }
    """
    cars = race_state.get("cars", [])
    if not cars:
        return {
            "laps_simulated": 0,
            "simulations": n_simulations,
            "predictions": [],
        }

    # Determine laps remaining
    if laps_remaining is None:
        total = race_state.get("total_laps")
        current = race_state.get("lap")
        try:
            laps_remaining = max(1, int(total) - int(current))
        except (TypeError, ValueError):
            laps_remaining = 20  # sensible fallback

    laps_remaining = max(1, laps_remaining)
    n_simulations = max(1, min(n_simulations, 10_000))

    # Per-car accumulators
    car_ids = [str(c.get("id", c.get("number", f"car_{i}"))) for i, c in enumerate(cars)]
    car_names = {
        str(c.get("id", c.get("number", f"car_{i}"))): c.get("name", c.get("id", "?"))
        for i, c in enumerate(cars)
    }

    # positions_per_car: car_id -> list of finishing positions across simulations
    positions_per_car: dict[str, list[int]] = {cid: [] for cid in car_ids}

    rng = random.Random()  # thread-safe local RNG

    for _ in range(n_simulations):
        run_results = _simulate_one_run(cars, laps_remaining, rng)
        for finishing_pos, (car_id, _) in enumerate(run_results, start=1):
            if car_id in positions_per_car:
                positions_per_car[car_id].append(finishing_pos)

    n_cars = len(cars)
    predictions = []

    for car_id in car_ids:
        pos_list = positions_per_car[car_id]
        if not pos_list:
            continue

        n = len(pos_list)
        win_prob = sum(1 for p in pos_list if p == 1) / n
        podium_prob = sum(1 for p in pos_list if p <= 3) / n
        expected_pos = statistics.mean(pos_list)

        sorted_pos = sorted(pos_list)
        p10_idx = max(0, int(0.10 * n) - 1)
        p90_idx = min(n - 1, int(0.90 * n))
        p10_val = sorted_pos[p10_idx]
        p90_val = sorted_pos[p90_idx]

        predictions.append(
            {
                "id": car_id,
                "name": car_names.get(car_id, car_id),
                "win_probability": round(win_prob, 4),
                "podium_probability": round(podium_prob, 4),
                "expected_position": round(expected_pos, 2),
                "p10": p10_val,
                "p90": p90_val,
            }
        )

    # Sort by win_probability descending, then expected_position ascending as tiebreak
    predictions.sort(key=lambda x: (-x["win_probability"], x["expected_position"]))

    return {
        "laps_simulated": laps_remaining,
        "simulations": n_simulations,
        "predictions": predictions,
    }
