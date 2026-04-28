"""
Championship standings module for GenieF1.

Aggregates race results from historical.py to produce driver and constructor
championship standings for any supported season.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

import historical

logger = logging.getLogger(__name__)


def driver_standings(season: int) -> List[Dict[str, Any]]:
    """
    Compute driver championship standings for the given season.

    Aggregates points from every race in the season using
    historical.get_race_results and returns drivers sorted by points
    descending.

    Returns a list of dicts:
        {
            "position": int,
            "driver": str,       # three-letter code
            "driver_name": str,
            "team": str,
            "points": int,
            "wins": int,
            "podiums": int,
        }
    """
    races = historical.list_races(season)
    totals: Dict[str, Dict[str, Any]] = {}

    for race in races:
        try:
            result = historical.get_race_results(season, race["round"])
        except Exception as exc:
            logger.warning("Could not get results for %d R%d: %s", season, race["round"], exc)
            continue

        for entry in result.get("results", []):
            driver_code = entry.get("driver", "???")
            driver_name = entry.get("driver_name", driver_code)
            team = entry.get("team", "Unknown")
            pts = entry.get("points", 0)
            pos = entry.get("position", 99)

            if driver_code not in totals:
                totals[driver_code] = {
                    "driver": driver_code,
                    "driver_name": driver_name,
                    "team": team,
                    "points": 0,
                    "wins": 0,
                    "podiums": 0,
                }

            totals[driver_code]["points"] += pts
            if pos == 1:
                totals[driver_code]["wins"] += 1
            if pos <= 3:
                totals[driver_code]["podiums"] += 1

    # Sort by points descending, then wins descending as tiebreaker
    sorted_drivers = sorted(
        totals.values(),
        key=lambda d: (d["points"], d["wins"]),
        reverse=True,
    )

    standings = []
    for idx, driver in enumerate(sorted_drivers, start=1):
        standings.append({
            "position": idx,
            "driver": driver["driver"],
            "driver_name": driver["driver_name"],
            "team": driver["team"],
            "points": driver["points"],
            "wins": driver["wins"],
            "podiums": driver["podiums"],
        })

    return standings


def constructor_standings(season: int) -> List[Dict[str, Any]]:
    """
    Compute constructor (team) championship standings for the given season.

    Sums points earned by all drivers of the same team and returns teams
    sorted by points descending.

    Returns a list of dicts:
        {
            "position": int,
            "team": str,
            "points": int,
            "wins": int,
        }
    """
    races = historical.list_races(season)
    totals: Dict[str, Dict[str, Any]] = {}

    for race in races:
        try:
            result = historical.get_race_results(season, race["round"])
        except Exception as exc:
            logger.warning("Could not get results for %d R%d: %s", season, race["round"], exc)
            continue

        for entry in result.get("results", []):
            team = entry.get("team", "Unknown")
            pts = entry.get("points", 0)
            pos = entry.get("position", 99)

            if team not in totals:
                totals[team] = {
                    "team": team,
                    "points": 0,
                    "wins": 0,
                }

            totals[team]["points"] += pts
            if pos == 1:
                totals[team]["wins"] += 1

    sorted_teams = sorted(
        totals.values(),
        key=lambda t: (t["points"], t["wins"]),
        reverse=True,
    )

    standings = []
    for idx, team in enumerate(sorted_teams, start=1):
        standings.append({
            "position": idx,
            "team": team["team"],
            "points": team["points"],
            "wins": team["wins"],
        })

    return standings
