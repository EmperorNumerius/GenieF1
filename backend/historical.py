"""
Historical race data module for GenieF1.

Provides calendar data and race results for past F1 seasons.
For 2024+ seasons it attempts to use the livef1 package; for all other
seasons (and as a universal fallback) it uses a deterministic mock based
on a hash of (season, round) so the same inputs always return the same
finish order.
"""

from __future__ import annotations

import hashlib
import os
import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

# In-memory cache for race results (avoids repeated network calls)
_RESULTS_CACHE: dict = {}


# ---------------------------------------------------------------------------
# Canonical driver roster per era (used for mock result generation)
# ---------------------------------------------------------------------------

_DRIVERS_2018_2019 = [
    ("HAM", "Lewis Hamilton", "Mercedes"),
    ("BOT", "Valtteri Bottas", "Mercedes"),
    ("VET", "Sebastian Vettel", "Ferrari"),
    ("LEC", "Charles Leclerc", "Ferrari"),
    ("VER", "Max Verstappen", "Red Bull Racing"),
    ("GAS", "Pierre Gasly", "Red Bull Racing"),
    ("RIC", "Daniel Ricciardo", "Red Bull Racing"),
    ("SAI", "Carlos Sainz", "McLaren"),
    ("NOR", "Lando Norris", "McLaren"),
    ("ALO", "Fernando Alonso", "Renault"),
    ("HUL", "Nico Hulkenberg", "Renault"),
    ("OCO", "Esteban Ocon", "Force India"),
    ("PER", "Sergio Perez", "Force India"),
    ("STR", "Lance Stroll", "Williams"),
    ("SIR", "Romain Grosjean", "Haas F1 Team"),
    ("MAG", "Kevin Magnussen", "Haas F1 Team"),
    ("ERI", "Marcus Ericsson", "Sauber"),
    ("LEC", "Charles Leclerc", "Sauber"),
    ("HAR", "Brendon Hartley", "Toro Rosso"),
    ("GAS", "Pierre Gasly", "Toro Rosso"),
]

_DRIVERS_2020_2022 = [
    ("HAM", "Lewis Hamilton", "Mercedes"),
    ("BOT", "Valtteri Bottas", "Mercedes"),
    ("VER", "Max Verstappen", "Red Bull Racing"),
    ("PER", "Sergio Perez", "Red Bull Racing"),
    ("LEC", "Charles Leclerc", "Ferrari"),
    ("SAI", "Carlos Sainz", "Ferrari"),
    ("NOR", "Lando Norris", "McLaren"),
    ("RIC", "Daniel Ricciardo", "McLaren"),
    ("ALO", "Fernando Alonso", "Alpine"),
    ("OCO", "Esteban Ocon", "Alpine"),
    ("GAS", "Pierre Gasly", "AlphaTauri"),
    ("TSU", "Yuki Tsunoda", "AlphaTauri"),
    ("STR", "Lance Stroll", "Aston Martin"),
    ("VET", "Sebastian Vettel", "Aston Martin"),
    ("RUS", "George Russell", "Williams"),
    ("LAT", "Nicholas Latifi", "Williams"),
    ("MAG", "Kevin Magnussen", "Haas F1 Team"),
    ("MSC", "Mick Schumacher", "Haas F1 Team"),
    ("BOT", "Valtteri Bottas", "Alfa Romeo"),
    ("ZHO", "Zhou Guanyu", "Alfa Romeo"),
]

_DRIVERS_2023 = [
    ("VER", "Max Verstappen", "Red Bull Racing"),
    ("PER", "Sergio Perez", "Red Bull Racing"),
    ("ALO", "Fernando Alonso", "Aston Martin"),
    ("STR", "Lance Stroll", "Aston Martin"),
    ("HAM", "Lewis Hamilton", "Mercedes"),
    ("RUS", "George Russell", "Mercedes"),
    ("LEC", "Charles Leclerc", "Ferrari"),
    ("SAI", "Carlos Sainz", "Ferrari"),
    ("NOR", "Lando Norris", "McLaren"),
    ("PIA", "Oscar Piastri", "McLaren"),
    ("GAS", "Pierre Gasly", "Alpine"),
    ("OCO", "Esteban Ocon", "Alpine"),
    ("TSU", "Yuki Tsunoda", "AlphaTauri"),
    ("DEV", "Nyck de Vries", "AlphaTauri"),
    ("ALB", "Alexander Albon", "Williams"),
    ("SAR", "Logan Sargeant", "Williams"),
    ("MAG", "Kevin Magnussen", "Haas F1 Team"),
    ("HUL", "Nico Hulkenberg", "Haas F1 Team"),
    ("BOT", "Valtteri Bottas", "Alfa Romeo"),
    ("ZHO", "Zhou Guanyu", "Alfa Romeo"),
]

_DRIVERS_2024 = [
    ("VER", "Max Verstappen", "Red Bull Racing"),
    ("PER", "Sergio Perez", "Red Bull Racing"),
    ("HAM", "Lewis Hamilton", "Mercedes"),
    ("RUS", "George Russell", "Mercedes"),
    ("LEC", "Charles Leclerc", "Ferrari"),
    ("SAI", "Carlos Sainz", "Ferrari"),
    ("NOR", "Lando Norris", "McLaren"),
    ("PIA", "Oscar Piastri", "McLaren"),
    ("ALO", "Fernando Alonso", "Aston Martin"),
    ("STR", "Lance Stroll", "Aston Martin"),
    ("GAS", "Pierre Gasly", "Alpine"),
    ("OCO", "Esteban Ocon", "Alpine"),
    ("TSU", "Yuki Tsunoda", "Racing Bulls"),
    ("RIC", "Daniel Ricciardo", "Racing Bulls"),
    ("ALB", "Alexander Albon", "Williams"),
    ("SAR", "Logan Sargeant", "Williams"),
    ("MAG", "Kevin Magnussen", "Haas F1 Team"),
    ("HUL", "Nico Hulkenberg", "Haas F1 Team"),
    ("BOT", "Valtteri Bottas", "Kick Sauber"),
    ("ZHO", "Zhou Guanyu", "Kick Sauber"),
]

_DRIVERS_2025 = [
    ("VER", "Max Verstappen", "Red Bull Racing"),
    ("LAW", "Liam Lawson", "Red Bull Racing"),
    ("HAM", "Lewis Hamilton", "Ferrari"),
    ("LEC", "Charles Leclerc", "Ferrari"),
    ("RUS", "George Russell", "Mercedes"),
    ("ANT", "Kimi Antonelli", "Mercedes"),
    ("NOR", "Lando Norris", "McLaren"),
    ("PIA", "Oscar Piastri", "McLaren"),
    ("ALO", "Fernando Alonso", "Aston Martin"),
    ("STR", "Lance Stroll", "Aston Martin"),
    ("GAS", "Pierre Gasly", "Alpine"),
    ("DOO", "Jack Doohan", "Alpine"),
    ("TSU", "Yuki Tsunoda", "Racing Bulls"),
    ("HAD", "Isack Hadjar", "Racing Bulls"),
    ("ALB", "Alexander Albon", "Williams"),
    ("SAI", "Carlos Sainz", "Williams"),
    ("BEA", "Oliver Bearman", "Haas F1 Team"),
    ("OCO", "Esteban Ocon", "Haas F1 Team"),
    ("HUL", "Nico Hulkenberg", "Kick Sauber"),
    ("BOR", "Gabriel Bortoleto", "Kick Sauber"),
]

_DRIVERS_2026 = [
    ("VER", "Max Verstappen", "Red Bull Racing"),
    ("LAW", "Liam Lawson", "Red Bull Racing"),
    ("HAM", "Lewis Hamilton", "Ferrari"),
    ("LEC", "Charles Leclerc", "Ferrari"),
    ("RUS", "George Russell", "Mercedes"),
    ("ANT", "Kimi Antonelli", "Mercedes"),
    ("NOR", "Lando Norris", "McLaren"),
    ("PIA", "Oscar Piastri", "McLaren"),
    ("ALO", "Fernando Alonso", "Aston Martin"),
    ("STR", "Lance Stroll", "Aston Martin"),
    ("GAS", "Pierre Gasly", "Alpine"),
    ("COL", "Franco Colapinto", "Alpine"),
    ("TSU", "Yuki Tsunoda", "Racing Bulls"),
    ("HAD", "Isack Hadjar", "Racing Bulls"),
    ("ALB", "Alexander Albon", "Williams"),
    ("SAI", "Carlos Sainz", "Williams"),
    ("BEA", "Oliver Bearman", "Haas F1 Team"),
    ("OCO", "Esteban Ocon", "Haas F1 Team"),
    ("HUL", "Nico Hulkenberg", "Audi"),
    ("ZHO", "Zhou Guanyu", "Cadillac"),
]

def _get_drivers_for_season(season: int) -> List[tuple]:
    if season <= 2019:
        return _DRIVERS_2018_2019
    elif season <= 2022:
        return _DRIVERS_2020_2022
    elif season == 2023:
        return _DRIVERS_2023
    elif season == 2024:
        return _DRIVERS_2024
    elif season == 2025:
        return _DRIVERS_2025
    else:
        return _DRIVERS_2026


# ---------------------------------------------------------------------------
# Points system
# ---------------------------------------------------------------------------

_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]


def _points_for_position(pos: int) -> int:
    """Return championship points for a finishing position (1-indexed)."""
    if 1 <= pos <= 10:
        return _POINTS[pos - 1]
    return 0


# ---------------------------------------------------------------------------
# Hardcoded calendars for 2024–2026
# ---------------------------------------------------------------------------

_CALENDAR_2024 = [
    {"round": 1,  "name": "Bahrain Grand Prix",         "country": "Bahrain",      "circuit": "Bahrain International Circuit",     "date": "2024-03-02"},
    {"round": 2,  "name": "Saudi Arabian Grand Prix",   "country": "Saudi Arabia", "circuit": "Jeddah Corniche Circuit",            "date": "2024-03-09"},
    {"round": 3,  "name": "Australian Grand Prix",      "country": "Australia",    "circuit": "Albert Park Circuit",               "date": "2024-03-24"},
    {"round": 4,  "name": "Japanese Grand Prix",        "country": "Japan",        "circuit": "Suzuka Circuit",                    "date": "2024-04-07"},
    {"round": 5,  "name": "Chinese Grand Prix",         "country": "China",        "circuit": "Shanghai International Circuit",    "date": "2024-04-21"},
    {"round": 6,  "name": "Miami Grand Prix",           "country": "USA",          "circuit": "Miami International Autodrome",     "date": "2024-05-05"},
    {"round": 7,  "name": "Emilia Romagna Grand Prix",  "country": "Italy",        "circuit": "Autodromo Enzo e Dino Ferrari",     "date": "2024-05-19"},
    {"round": 8,  "name": "Monaco Grand Prix",          "country": "Monaco",       "circuit": "Circuit de Monaco",                 "date": "2024-05-26"},
    {"round": 9,  "name": "Canadian Grand Prix",        "country": "Canada",       "circuit": "Circuit Gilles Villeneuve",         "date": "2024-06-09"},
    {"round": 10, "name": "Spanish Grand Prix",         "country": "Spain",        "circuit": "Circuit de Barcelona-Catalunya",    "date": "2024-06-23"},
    {"round": 11, "name": "Austrian Grand Prix",        "country": "Austria",      "circuit": "Red Bull Ring",                     "date": "2024-06-30"},
    {"round": 12, "name": "British Grand Prix",         "country": "UK",           "circuit": "Silverstone Circuit",               "date": "2024-07-07"},
    {"round": 13, "name": "Hungarian Grand Prix",       "country": "Hungary",      "circuit": "Hungaroring",                       "date": "2024-07-21"},
    {"round": 14, "name": "Belgian Grand Prix",         "country": "Belgium",      "circuit": "Circuit de Spa-Francorchamps",      "date": "2024-07-28"},
    {"round": 15, "name": "Dutch Grand Prix",           "country": "Netherlands",  "circuit": "Circuit Zandvoort",                 "date": "2024-08-25"},
    {"round": 16, "name": "Italian Grand Prix",         "country": "Italy",        "circuit": "Autodromo Nazionale Monza",         "date": "2024-09-01"},
    {"round": 17, "name": "Azerbaijan Grand Prix",      "country": "Azerbaijan",   "circuit": "Baku City Circuit",                 "date": "2024-09-15"},
    {"round": 18, "name": "Singapore Grand Prix",       "country": "Singapore",    "circuit": "Marina Bay Street Circuit",         "date": "2024-09-22"},
    {"round": 19, "name": "United States Grand Prix",   "country": "USA",          "circuit": "Circuit of the Americas",           "date": "2024-10-20"},
    {"round": 20, "name": "Mexico City Grand Prix",     "country": "Mexico",       "circuit": "Autodromo Hermanos Rodriguez",      "date": "2024-10-27"},
    {"round": 21, "name": "São Paulo Grand Prix",       "country": "Brazil",       "circuit": "Autodromo Jose Carlos Pace",        "date": "2024-11-03"},
    {"round": 22, "name": "Las Vegas Grand Prix",       "country": "USA",          "circuit": "Las Vegas Street Circuit",          "date": "2024-11-23"},
    {"round": 23, "name": "Qatar Grand Prix",           "country": "Qatar",        "circuit": "Lusail International Circuit",      "date": "2024-12-01"},
    {"round": 24, "name": "Abu Dhabi Grand Prix",       "country": "UAE",          "circuit": "Yas Marina Circuit",                "date": "2024-12-08"},
]

_CALENDAR_2025 = [
    {"round": 1,  "name": "Australian Grand Prix",      "country": "Australia",    "circuit": "Albert Park Circuit",               "date": "2025-03-16"},
    {"round": 2,  "name": "Chinese Grand Prix",         "country": "China",        "circuit": "Shanghai International Circuit",    "date": "2025-03-23"},
    {"round": 3,  "name": "Japanese Grand Prix",        "country": "Japan",        "circuit": "Suzuka Circuit",                    "date": "2025-04-06"},
    {"round": 4,  "name": "Bahrain Grand Prix",         "country": "Bahrain",      "circuit": "Bahrain International Circuit",     "date": "2025-04-13"},
    {"round": 5,  "name": "Saudi Arabian Grand Prix",   "country": "Saudi Arabia", "circuit": "Jeddah Corniche Circuit",            "date": "2025-04-20"},
    {"round": 6,  "name": "Miami Grand Prix",           "country": "USA",          "circuit": "Miami International Autodrome",     "date": "2025-05-04"},
    {"round": 7,  "name": "Emilia Romagna Grand Prix",  "country": "Italy",        "circuit": "Autodromo Enzo e Dino Ferrari",     "date": "2025-05-18"},
    {"round": 8,  "name": "Monaco Grand Prix",          "country": "Monaco",       "circuit": "Circuit de Monaco",                 "date": "2025-05-25"},
    {"round": 9,  "name": "Spanish Grand Prix",         "country": "Spain",        "circuit": "Circuit de Barcelona-Catalunya",    "date": "2025-06-01"},
    {"round": 10, "name": "Canadian Grand Prix",        "country": "Canada",       "circuit": "Circuit Gilles Villeneuve",         "date": "2025-06-15"},
    {"round": 11, "name": "Austrian Grand Prix",        "country": "Austria",      "circuit": "Red Bull Ring",                     "date": "2025-06-29"},
    {"round": 12, "name": "British Grand Prix",         "country": "UK",           "circuit": "Silverstone Circuit",               "date": "2025-07-06"},
    {"round": 13, "name": "Belgian Grand Prix",         "country": "Belgium",      "circuit": "Circuit de Spa-Francorchamps",      "date": "2025-07-27"},
    {"round": 14, "name": "Hungarian Grand Prix",       "country": "Hungary",      "circuit": "Hungaroring",                       "date": "2025-08-03"},
    {"round": 15, "name": "Dutch Grand Prix",           "country": "Netherlands",  "circuit": "Circuit Zandvoort",                 "date": "2025-08-31"},
    {"round": 16, "name": "Italian Grand Prix",         "country": "Italy",        "circuit": "Autodromo Nazionale Monza",         "date": "2025-09-07"},
    {"round": 17, "name": "Azerbaijan Grand Prix",      "country": "Azerbaijan",   "circuit": "Baku City Circuit",                 "date": "2025-09-21"},
    {"round": 18, "name": "Singapore Grand Prix",       "country": "Singapore",    "circuit": "Marina Bay Street Circuit",         "date": "2025-10-05"},
    {"round": 19, "name": "United States Grand Prix",   "country": "USA",          "circuit": "Circuit of the Americas",           "date": "2025-10-19"},
    {"round": 20, "name": "Mexico City Grand Prix",     "country": "Mexico",       "circuit": "Autodromo Hermanos Rodriguez",      "date": "2025-10-26"},
    {"round": 21, "name": "São Paulo Grand Prix",       "country": "Brazil",       "circuit": "Autodromo Jose Carlos Pace",        "date": "2025-11-09"},
    {"round": 22, "name": "Las Vegas Grand Prix",       "country": "USA",          "circuit": "Las Vegas Street Circuit",          "date": "2025-11-22"},
    {"round": 23, "name": "Qatar Grand Prix",           "country": "Qatar",        "circuit": "Lusail International Circuit",      "date": "2025-11-30"},
    {"round": 24, "name": "Abu Dhabi Grand Prix",       "country": "UAE",          "circuit": "Yas Marina Circuit",                "date": "2025-12-07"},
]

_CALENDAR_2026 = [
    {"round": 1,  "name": "Australian Grand Prix",      "country": "Australia",    "circuit": "Albert Park Circuit",               "date": "2026-03-15"},
    {"round": 2,  "name": "Chinese Grand Prix",         "country": "China",        "circuit": "Shanghai International Circuit",    "date": "2026-03-22"},
    {"round": 3,  "name": "Japanese Grand Prix",        "country": "Japan",        "circuit": "Suzuka Circuit",                    "date": "2026-04-05"},
    {"round": 4,  "name": "Bahrain Grand Prix",         "country": "Bahrain",      "circuit": "Bahrain International Circuit",     "date": "2026-04-19"},
    {"round": 5,  "name": "Saudi Arabian Grand Prix",   "country": "Saudi Arabia", "circuit": "Jeddah Corniche Circuit",            "date": "2026-04-26"},
    {"round": 6,  "name": "Miami Grand Prix",           "country": "USA",          "circuit": "Miami International Autodrome",     "date": "2026-05-10"},
    {"round": 7,  "name": "Monaco Grand Prix",          "country": "Monaco",       "circuit": "Circuit de Monaco",                 "date": "2026-05-24"},
    {"round": 8,  "name": "Spanish Grand Prix",         "country": "Spain",        "circuit": "Circuit de Barcelona-Catalunya",    "date": "2026-06-07"},
    {"round": 9,  "name": "Canadian Grand Prix",        "country": "Canada",       "circuit": "Circuit Gilles Villeneuve",         "date": "2026-06-14"},
    {"round": 10, "name": "Austrian Grand Prix",        "country": "Austria",      "circuit": "Red Bull Ring",                     "date": "2026-06-28"},
    {"round": 11, "name": "British Grand Prix",         "country": "UK",           "circuit": "Silverstone Circuit",               "date": "2026-07-05"},
    {"round": 12, "name": "Belgian Grand Prix",         "country": "Belgium",      "circuit": "Circuit de Spa-Francorchamps",      "date": "2026-07-26"},
    {"round": 13, "name": "Hungarian Grand Prix",       "country": "Hungary",      "circuit": "Hungaroring",                       "date": "2026-08-02"},
    {"round": 14, "name": "Dutch Grand Prix",           "country": "Netherlands",  "circuit": "Circuit Zandvoort",                 "date": "2026-08-30"},
    {"round": 15, "name": "Italian Grand Prix",         "country": "Italy",        "circuit": "Autodromo Nazionale Monza",         "date": "2026-09-06"},
    {"round": 16, "name": "Singapore Grand Prix",       "country": "Singapore",    "circuit": "Marina Bay Street Circuit",         "date": "2026-09-20"},
    {"round": 17, "name": "Azerbaijan Grand Prix",      "country": "Azerbaijan",   "circuit": "Baku City Circuit",                 "date": "2026-10-04"},
    {"round": 18, "name": "United States Grand Prix",   "country": "USA",          "circuit": "Circuit of the Americas",           "date": "2026-10-18"},
    {"round": 19, "name": "Mexico City Grand Prix",     "country": "Mexico",       "circuit": "Autodromo Hermanos Rodriguez",      "date": "2026-10-25"},
    {"round": 20, "name": "São Paulo Grand Prix",       "country": "Brazil",       "circuit": "Autodromo Jose Carlos Pace",        "date": "2026-11-08"},
    {"round": 21, "name": "Las Vegas Grand Prix",       "country": "USA",          "circuit": "Las Vegas Street Circuit",          "date": "2026-11-21"},
    {"round": 22, "name": "Qatar Grand Prix",           "country": "Qatar",        "circuit": "Lusail International Circuit",      "date": "2026-11-29"},
    {"round": 23, "name": "Abu Dhabi Grand Prix",       "country": "UAE",          "circuit": "Yas Marina Circuit",                "date": "2026-12-06"},
]

# Fallback sample calendars for older seasons
_CALENDAR_LEGACY = {
    2018: [
        {"round": 1,  "name": "Australian Grand Prix",  "country": "Australia",   "circuit": "Albert Park Circuit",             "date": "2018-03-25"},
        {"round": 2,  "name": "Bahrain Grand Prix",     "country": "Bahrain",     "circuit": "Bahrain International Circuit",   "date": "2018-04-08"},
        {"round": 3,  "name": "Chinese Grand Prix",     "country": "China",       "circuit": "Shanghai International Circuit",  "date": "2018-04-15"},
        {"round": 4,  "name": "Azerbaijan Grand Prix",  "country": "Azerbaijan",  "circuit": "Baku City Circuit",               "date": "2018-04-29"},
        {"round": 5,  "name": "Spanish Grand Prix",     "country": "Spain",       "circuit": "Circuit de Barcelona-Catalunya",  "date": "2018-05-13"},
        {"round": 6,  "name": "Monaco Grand Prix",      "country": "Monaco",      "circuit": "Circuit de Monaco",               "date": "2018-05-27"},
        {"round": 7,  "name": "Canadian Grand Prix",    "country": "Canada",      "circuit": "Circuit Gilles Villeneuve",       "date": "2018-06-10"},
        {"round": 8,  "name": "French Grand Prix",      "country": "France",      "circuit": "Circuit Paul Ricard",             "date": "2018-06-24"},
        {"round": 9,  "name": "Austrian Grand Prix",    "country": "Austria",     "circuit": "Red Bull Ring",                   "date": "2018-07-01"},
        {"round": 10, "name": "British Grand Prix",     "country": "UK",          "circuit": "Silverstone Circuit",             "date": "2018-07-08"},
        {"round": 11, "name": "German Grand Prix",      "country": "Germany",     "circuit": "Hockenheimring",                  "date": "2018-07-22"},
        {"round": 12, "name": "Hungarian Grand Prix",   "country": "Hungary",     "circuit": "Hungaroring",                     "date": "2018-07-29"},
        {"round": 13, "name": "Belgian Grand Prix",     "country": "Belgium",     "circuit": "Circuit de Spa-Francorchamps",    "date": "2018-08-26"},
        {"round": 14, "name": "Italian Grand Prix",     "country": "Italy",       "circuit": "Autodromo Nazionale Monza",       "date": "2018-09-02"},
        {"round": 15, "name": "Singapore Grand Prix",   "country": "Singapore",   "circuit": "Marina Bay Street Circuit",       "date": "2018-09-16"},
        {"round": 16, "name": "Russian Grand Prix",     "country": "Russia",      "circuit": "Sochi Autodrom",                  "date": "2018-09-30"},
        {"round": 17, "name": "Japanese Grand Prix",    "country": "Japan",       "circuit": "Suzuka Circuit",                  "date": "2018-10-07"},
        {"round": 18, "name": "United States Grand Prix","country": "USA",         "circuit": "Circuit of the Americas",         "date": "2018-10-21"},
        {"round": 19, "name": "Mexico City Grand Prix", "country": "Mexico",      "circuit": "Autodromo Hermanos Rodriguez",    "date": "2018-10-28"},
        {"round": 20, "name": "Brazilian Grand Prix",   "country": "Brazil",      "circuit": "Autodromo Jose Carlos Pace",      "date": "2018-11-11"},
        {"round": 21, "name": "Abu Dhabi Grand Prix",   "country": "UAE",         "circuit": "Yas Marina Circuit",              "date": "2018-11-25"},
    ],
    2019: [
        {"round": 1,  "name": "Australian Grand Prix",  "country": "Australia",   "circuit": "Albert Park Circuit",             "date": "2019-03-17"},
        {"round": 2,  "name": "Bahrain Grand Prix",     "country": "Bahrain",     "circuit": "Bahrain International Circuit",   "date": "2019-03-31"},
        {"round": 3,  "name": "Chinese Grand Prix",     "country": "China",       "circuit": "Shanghai International Circuit",  "date": "2019-04-14"},
        {"round": 4,  "name": "Azerbaijan Grand Prix",  "country": "Azerbaijan",  "circuit": "Baku City Circuit",               "date": "2019-04-28"},
        {"round": 5,  "name": "Spanish Grand Prix",     "country": "Spain",       "circuit": "Circuit de Barcelona-Catalunya",  "date": "2019-05-12"},
        {"round": 6,  "name": "Monaco Grand Prix",      "country": "Monaco",      "circuit": "Circuit de Monaco",               "date": "2019-05-26"},
        {"round": 7,  "name": "Canadian Grand Prix",    "country": "Canada",      "circuit": "Circuit Gilles Villeneuve",       "date": "2019-06-09"},
        {"round": 8,  "name": "French Grand Prix",      "country": "France",      "circuit": "Circuit Paul Ricard",             "date": "2019-06-23"},
        {"round": 9,  "name": "Austrian Grand Prix",    "country": "Austria",     "circuit": "Red Bull Ring",                   "date": "2019-06-30"},
        {"round": 10, "name": "British Grand Prix",     "country": "UK",          "circuit": "Silverstone Circuit",             "date": "2019-07-14"},
        {"round": 11, "name": "German Grand Prix",      "country": "Germany",     "circuit": "Hockenheimring",                  "date": "2019-07-28"},
        {"round": 12, "name": "Hungarian Grand Prix",   "country": "Hungary",     "circuit": "Hungaroring",                     "date": "2019-08-04"},
        {"round": 13, "name": "Belgian Grand Prix",     "country": "Belgium",     "circuit": "Circuit de Spa-Francorchamps",    "date": "2019-09-01"},
        {"round": 14, "name": "Italian Grand Prix",     "country": "Italy",       "circuit": "Autodromo Nazionale Monza",       "date": "2019-09-08"},
        {"round": 15, "name": "Singapore Grand Prix",   "country": "Singapore",   "circuit": "Marina Bay Street Circuit",       "date": "2019-09-22"},
        {"round": 16, "name": "Russian Grand Prix",     "country": "Russia",      "circuit": "Sochi Autodrom",                  "date": "2019-09-29"},
        {"round": 17, "name": "Japanese Grand Prix",    "country": "Japan",       "circuit": "Suzuka Circuit",                  "date": "2019-10-13"},
        {"round": 18, "name": "Mexican Grand Prix",     "country": "Mexico",      "circuit": "Autodromo Hermanos Rodriguez",    "date": "2019-10-27"},
        {"round": 19, "name": "United States Grand Prix","country": "USA",         "circuit": "Circuit of the Americas",         "date": "2019-11-03"},
        {"round": 20, "name": "Brazilian Grand Prix",   "country": "Brazil",      "circuit": "Autodromo Jose Carlos Pace",      "date": "2019-11-17"},
        {"round": 21, "name": "Abu Dhabi Grand Prix",   "country": "UAE",         "circuit": "Yas Marina Circuit",              "date": "2019-12-01"},
    ],
    2020: [
        {"round": 1,  "name": "Austrian Grand Prix",      "country": "Austria",    "circuit": "Red Bull Ring",                  "date": "2020-07-05"},
        {"round": 2,  "name": "Styrian Grand Prix",       "country": "Austria",    "circuit": "Red Bull Ring",                  "date": "2020-07-12"},
        {"round": 3,  "name": "Hungarian Grand Prix",     "country": "Hungary",    "circuit": "Hungaroring",                    "date": "2020-07-19"},
        {"round": 4,  "name": "British Grand Prix",       "country": "UK",         "circuit": "Silverstone Circuit",            "date": "2020-08-02"},
        {"round": 5,  "name": "70th Anniversary Grand Prix","country": "UK",        "circuit": "Silverstone Circuit",            "date": "2020-08-09"},
        {"round": 6,  "name": "Spanish Grand Prix",       "country": "Spain",      "circuit": "Circuit de Barcelona-Catalunya", "date": "2020-08-16"},
        {"round": 7,  "name": "Belgian Grand Prix",       "country": "Belgium",    "circuit": "Circuit de Spa-Francorchamps",   "date": "2020-08-30"},
        {"round": 8,  "name": "Italian Grand Prix",       "country": "Italy",      "circuit": "Autodromo Nazionale Monza",      "date": "2020-09-06"},
        {"round": 9,  "name": "Tuscan Grand Prix",        "country": "Italy",      "circuit": "Mugello Circuit",                "date": "2020-09-13"},
        {"round": 10, "name": "Russian Grand Prix",       "country": "Russia",     "circuit": "Sochi Autodrom",                 "date": "2020-09-27"},
        {"round": 11, "name": "Eifel Grand Prix",         "country": "Germany",    "circuit": "Nurburgring",                    "date": "2020-10-11"},
        {"round": 12, "name": "Portuguese Grand Prix",    "country": "Portugal",   "circuit": "Autodromo Internacional do Algarve","date": "2020-10-25"},
        {"round": 13, "name": "Emilia Romagna Grand Prix","country": "Italy",      "circuit": "Autodromo Enzo e Dino Ferrari",  "date": "2020-11-01"},
        {"round": 14, "name": "Turkish Grand Prix",       "country": "Turkey",     "circuit": "Istanbul Park",                  "date": "2020-11-15"},
        {"round": 15, "name": "Bahrain Grand Prix",       "country": "Bahrain",    "circuit": "Bahrain International Circuit",  "date": "2020-11-29"},
        {"round": 16, "name": "Sakhir Grand Prix",        "country": "Bahrain",    "circuit": "Bahrain International Circuit",  "date": "2020-12-06"},
        {"round": 17, "name": "Abu Dhabi Grand Prix",     "country": "UAE",        "circuit": "Yas Marina Circuit",             "date": "2020-12-13"},
    ],
    2021: [
        {"round": 1,  "name": "Bahrain Grand Prix",       "country": "Bahrain",    "circuit": "Bahrain International Circuit",  "date": "2021-03-28"},
        {"round": 2,  "name": "Emilia Romagna Grand Prix","country": "Italy",      "circuit": "Autodromo Enzo e Dino Ferrari",  "date": "2021-04-18"},
        {"round": 3,  "name": "Portuguese Grand Prix",    "country": "Portugal",   "circuit": "Autodromo Internacional do Algarve","date": "2021-05-02"},
        {"round": 4,  "name": "Spanish Grand Prix",       "country": "Spain",      "circuit": "Circuit de Barcelona-Catalunya", "date": "2021-05-09"},
        {"round": 5,  "name": "Monaco Grand Prix",        "country": "Monaco",     "circuit": "Circuit de Monaco",              "date": "2021-05-23"},
        {"round": 6,  "name": "Azerbaijan Grand Prix",    "country": "Azerbaijan", "circuit": "Baku City Circuit",              "date": "2021-06-06"},
        {"round": 7,  "name": "French Grand Prix",        "country": "France",     "circuit": "Circuit Paul Ricard",            "date": "2021-06-20"},
        {"round": 8,  "name": "Styrian Grand Prix",       "country": "Austria",    "circuit": "Red Bull Ring",                  "date": "2021-06-27"},
        {"round": 9,  "name": "Austrian Grand Prix",      "country": "Austria",    "circuit": "Red Bull Ring",                  "date": "2021-07-04"},
        {"round": 10, "name": "British Grand Prix",       "country": "UK",         "circuit": "Silverstone Circuit",            "date": "2021-07-18"},
        {"round": 11, "name": "Hungarian Grand Prix",     "country": "Hungary",    "circuit": "Hungaroring",                    "date": "2021-08-01"},
        {"round": 12, "name": "Belgian Grand Prix",       "country": "Belgium",    "circuit": "Circuit de Spa-Francorchamps",   "date": "2021-08-29"},
        {"round": 13, "name": "Dutch Grand Prix",         "country": "Netherlands","circuit": "Circuit Zandvoort",              "date": "2021-09-05"},
        {"round": 14, "name": "Italian Grand Prix",       "country": "Italy",      "circuit": "Autodromo Nazionale Monza",      "date": "2021-09-12"},
        {"round": 15, "name": "Russian Grand Prix",       "country": "Russia",     "circuit": "Sochi Autodrom",                 "date": "2021-09-26"},
        {"round": 16, "name": "Turkish Grand Prix",       "country": "Turkey",     "circuit": "Istanbul Park",                  "date": "2021-10-10"},
        {"round": 17, "name": "United States Grand Prix", "country": "USA",        "circuit": "Circuit of the Americas",        "date": "2021-10-24"},
        {"round": 18, "name": "Mexico City Grand Prix",   "country": "Mexico",     "circuit": "Autodromo Hermanos Rodriguez",   "date": "2021-11-07"},
        {"round": 19, "name": "São Paulo Grand Prix",     "country": "Brazil",     "circuit": "Autodromo Jose Carlos Pace",     "date": "2021-11-14"},
        {"round": 20, "name": "Qatar Grand Prix",         "country": "Qatar",      "circuit": "Losail International Circuit",   "date": "2021-11-21"},
        {"round": 21, "name": "Saudi Arabian Grand Prix", "country": "Saudi Arabia","circuit": "Jeddah Corniche Circuit",        "date": "2021-12-05"},
        {"round": 22, "name": "Abu Dhabi Grand Prix",     "country": "UAE",        "circuit": "Yas Marina Circuit",             "date": "2021-12-12"},
    ],
    2022: [
        {"round": 1,  "name": "Bahrain Grand Prix",       "country": "Bahrain",    "circuit": "Bahrain International Circuit",  "date": "2022-03-20"},
        {"round": 2,  "name": "Saudi Arabian Grand Prix", "country": "Saudi Arabia","circuit": "Jeddah Corniche Circuit",        "date": "2022-03-27"},
        {"round": 3,  "name": "Australian Grand Prix",    "country": "Australia",  "circuit": "Albert Park Circuit",            "date": "2022-04-10"},
        {"round": 4,  "name": "Emilia Romagna Grand Prix","country": "Italy",      "circuit": "Autodromo Enzo e Dino Ferrari",  "date": "2022-04-24"},
        {"round": 5,  "name": "Miami Grand Prix",         "country": "USA",        "circuit": "Miami International Autodrome",  "date": "2022-05-08"},
        {"round": 6,  "name": "Spanish Grand Prix",       "country": "Spain",      "circuit": "Circuit de Barcelona-Catalunya", "date": "2022-05-22"},
        {"round": 7,  "name": "Monaco Grand Prix",        "country": "Monaco",     "circuit": "Circuit de Monaco",              "date": "2022-05-29"},
        {"round": 8,  "name": "Azerbaijan Grand Prix",    "country": "Azerbaijan", "circuit": "Baku City Circuit",              "date": "2022-06-12"},
        {"round": 9,  "name": "Canadian Grand Prix",      "country": "Canada",     "circuit": "Circuit Gilles Villeneuve",      "date": "2022-06-19"},
        {"round": 10, "name": "British Grand Prix",       "country": "UK",         "circuit": "Silverstone Circuit",            "date": "2022-07-03"},
        {"round": 11, "name": "Austrian Grand Prix",      "country": "Austria",    "circuit": "Red Bull Ring",                  "date": "2022-07-10"},
        {"round": 12, "name": "French Grand Prix",        "country": "France",     "circuit": "Circuit Paul Ricard",            "date": "2022-07-24"},
        {"round": 13, "name": "Hungarian Grand Prix",     "country": "Hungary",    "circuit": "Hungaroring",                    "date": "2022-07-31"},
        {"round": 14, "name": "Belgian Grand Prix",       "country": "Belgium",    "circuit": "Circuit de Spa-Francorchamps",   "date": "2022-08-28"},
        {"round": 15, "name": "Dutch Grand Prix",         "country": "Netherlands","circuit": "Circuit Zandvoort",              "date": "2022-09-04"},
        {"round": 16, "name": "Italian Grand Prix",       "country": "Italy",      "circuit": "Autodromo Nazionale Monza",      "date": "2022-09-11"},
        {"round": 17, "name": "Singapore Grand Prix",     "country": "Singapore",  "circuit": "Marina Bay Street Circuit",      "date": "2022-10-02"},
        {"round": 18, "name": "Japanese Grand Prix",      "country": "Japan",      "circuit": "Suzuka Circuit",                 "date": "2022-10-09"},
        {"round": 19, "name": "United States Grand Prix", "country": "USA",        "circuit": "Circuit of the Americas",        "date": "2022-10-23"},
        {"round": 20, "name": "Mexico City Grand Prix",   "country": "Mexico",     "circuit": "Autodromo Hermanos Rodriguez",   "date": "2022-10-30"},
        {"round": 21, "name": "São Paulo Grand Prix",     "country": "Brazil",     "circuit": "Autodromo Jose Carlos Pace",     "date": "2022-11-13"},
        {"round": 22, "name": "Abu Dhabi Grand Prix",     "country": "UAE",        "circuit": "Yas Marina Circuit",             "date": "2022-11-20"},
    ],
    2023: [
        {"round": 1,  "name": "Bahrain Grand Prix",       "country": "Bahrain",    "circuit": "Bahrain International Circuit",  "date": "2023-03-05"},
        {"round": 2,  "name": "Saudi Arabian Grand Prix", "country": "Saudi Arabia","circuit": "Jeddah Corniche Circuit",        "date": "2023-03-19"},
        {"round": 3,  "name": "Australian Grand Prix",    "country": "Australia",  "circuit": "Albert Park Circuit",            "date": "2023-04-02"},
        {"round": 4,  "name": "Azerbaijan Grand Prix",    "country": "Azerbaijan", "circuit": "Baku City Circuit",              "date": "2023-04-30"},
        {"round": 5,  "name": "Miami Grand Prix",         "country": "USA",        "circuit": "Miami International Autodrome",  "date": "2023-05-07"},
        {"round": 6,  "name": "Monaco Grand Prix",        "country": "Monaco",     "circuit": "Circuit de Monaco",              "date": "2023-05-28"},
        {"round": 7,  "name": "Spanish Grand Prix",       "country": "Spain",      "circuit": "Circuit de Barcelona-Catalunya", "date": "2023-06-04"},
        {"round": 8,  "name": "Canadian Grand Prix",      "country": "Canada",     "circuit": "Circuit Gilles Villeneuve",      "date": "2023-06-18"},
        {"round": 9,  "name": "Austrian Grand Prix",      "country": "Austria",    "circuit": "Red Bull Ring",                  "date": "2023-07-02"},
        {"round": 10, "name": "British Grand Prix",       "country": "UK",         "circuit": "Silverstone Circuit",            "date": "2023-07-09"},
        {"round": 11, "name": "Hungarian Grand Prix",     "country": "Hungary",    "circuit": "Hungaroring",                    "date": "2023-07-23"},
        {"round": 12, "name": "Belgian Grand Prix",       "country": "Belgium",    "circuit": "Circuit de Spa-Francorchamps",   "date": "2023-07-30"},
        {"round": 13, "name": "Dutch Grand Prix",         "country": "Netherlands","circuit": "Circuit Zandvoort",              "date": "2023-08-27"},
        {"round": 14, "name": "Italian Grand Prix",       "country": "Italy",      "circuit": "Autodromo Nazionale Monza",      "date": "2023-09-03"},
        {"round": 15, "name": "Singapore Grand Prix",     "country": "Singapore",  "circuit": "Marina Bay Street Circuit",      "date": "2023-09-17"},
        {"round": 16, "name": "Japanese Grand Prix",      "country": "Japan",      "circuit": "Suzuka Circuit",                 "date": "2023-09-24"},
        {"round": 17, "name": "Qatar Grand Prix",         "country": "Qatar",      "circuit": "Lusail International Circuit",   "date": "2023-10-08"},
        {"round": 18, "name": "United States Grand Prix", "country": "USA",        "circuit": "Circuit of the Americas",        "date": "2023-10-22"},
        {"round": 19, "name": "Mexico City Grand Prix",   "country": "Mexico",     "circuit": "Autodromo Hermanos Rodriguez",   "date": "2023-10-29"},
        {"round": 20, "name": "São Paulo Grand Prix",     "country": "Brazil",     "circuit": "Autodromo Jose Carlos Pace",     "date": "2023-11-05"},
        {"round": 21, "name": "Las Vegas Grand Prix",     "country": "USA",        "circuit": "Las Vegas Street Circuit",       "date": "2023-11-18"},
        {"round": 22, "name": "Abu Dhabi Grand Prix",     "country": "UAE",        "circuit": "Yas Marina Circuit",             "date": "2023-11-26"},
    ],
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def list_seasons() -> List[int]:
    """Return the list of supported F1 seasons."""
    return [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]


def list_races(season: int) -> List[Dict[str, Any]]:
    """Return the F1 calendar for the given season."""
    if season == 2024:
        return _CALENDAR_2024
    if season == 2025:
        return _CALENDAR_2025
    if season == 2026:
        return _CALENDAR_2026
    if season in _CALENDAR_LEGACY:
        return _CALENDAR_LEGACY[season]
    # Minimal fallback for any other season
    return [
        {"round": 1,  "name": "Sample Grand Prix 1", "country": "Bahrain",   "circuit": "Bahrain International Circuit",  "date": f"{season}-03-15"},
        {"round": 2,  "name": "Sample Grand Prix 2", "country": "Australia", "circuit": "Albert Park Circuit",            "date": f"{season}-04-01"},
        {"round": 3,  "name": "Sample Grand Prix 3", "country": "Spain",     "circuit": "Circuit de Barcelona-Catalunya", "date": f"{season}-05-15"},
        {"round": 4,  "name": "Sample Grand Prix 4", "country": "Monaco",    "circuit": "Circuit de Monaco",              "date": f"{season}-05-28"},
        {"round": 5,  "name": "Sample Grand Prix 5", "country": "UAE",       "circuit": "Yas Marina Circuit",             "date": f"{season}-11-28"},
    ]


def _mock_race_results(season: int, round_num: int, race_info: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a deterministic mock race result using a hash of (season, round_num).
    The same inputs always produce the same finish order.
    """
    drivers = _get_drivers_for_season(season)
    n = len(drivers)

    # Build a stable permutation via hashed indices
    key = f"{season}:{round_num}".encode()
    digest = hashlib.sha256(key).digest()

    # Use digest bytes as sort keys to shuffle driver list deterministically
    indices = list(range(n))
    indices.sort(key=lambda i: digest[i % len(digest)])

    # Fastest lap goes to the driver in position 5 (0-indexed), capped to available drivers
    fastest_lap_idx = min(4, n - 1)

    results = []
    for pos, driver_idx in enumerate(indices, start=1):
        tla, name, team = drivers[driver_idx]
        pts = _points_for_position(pos)
        # Generate a plausible race time string
        base_mins = 1
        base_secs = 32.0 + (pos - 1) * 4.5 + ((digest[(driver_idx + pos) % len(digest)] % 10) * 0.1)
        laps_behind = (pos - 1) // 5
        if pos == 1:
            time_str = f"1:{int(base_secs):02d}.{int((base_secs % 1) * 1000):03d}"
        elif laps_behind > 0:
            time_str = f"+{laps_behind} lap{'s' if laps_behind > 1 else ''}"
        else:
            gap = (pos - 1) * 4.5 + (digest[(driver_idx) % len(digest)] % 100) * 0.1
            time_str = f"+{gap:.3f}s"

        results.append({
            "position": pos,
            "driver": tla,
            "driver_name": name,
            "team": team,
            "time": time_str,
            "points": pts,
            "fastest_lap": (pos - 1 == fastest_lap_idx),
        })

    return {
        "season": season,
        "round": round_num,
        "name": race_info["name"],
        "circuit": race_info["circuit"],
        "date": race_info["date"],
        "results": results,
    }


def get_race_results(season: int, round_num: int) -> Dict[str, Any]:
    """
    Return race results for the given season and round.

    For 2024+ attempts to use the livef1 package; falls back to a
    deterministic mock on any error. For pre-2024 seasons the mock is used
    directly since livef1 historical depth varies.

    Results are cached in memory so repeated calls for the same (season, round)
    are instant.
    """
    cache_key = (season, round_num)
    if cache_key in _RESULTS_CACHE:
        return _RESULTS_CACHE[cache_key]

    races = list_races(season)
    race_info = next((r for r in races if r["round"] == round_num), None)
    if race_info is None:
        return {}

    use_livef1 = os.environ.get("GENIE_LIVE_HISTORY", "").lower() in ("1", "true", "yes")
    if season >= 2024 and use_livef1:
        try:
            import livef1
            import concurrent.futures as _cf
            with _cf.ThreadPoolExecutor(max_workers=1) as _ex:
                _fut = _ex.submit(livef1.get_session, season, round_num, "R")
                try:
                    session = _fut.result(timeout=2)
                except _cf.TimeoutError:
                    raise RuntimeError("livef1 get_session timed out after 2s")
            if session is not None:
                # Try to pull classification data
                try:
                    session.generate(silver=True)
                    laps_df = session.get_laps()
                    if laps_df is not None and not laps_df.empty:
                        # Build results from last lap per driver
                        grouped = laps_df.groupby("DriverNo")
                        raw_results = []
                        for dn, grp in grouped:
                            last = grp.iloc[-1]
                            pos_val = last.get("Position") if hasattr(last, "get") else None
                            try:
                                pos_val = int(pos_val) if pos_val is not None else 99
                            except (ValueError, TypeError):
                                pos_val = 99
                            raw_results.append({
                                "driver_no": str(dn),
                                "position": pos_val,
                            })
                        raw_results.sort(key=lambda x: x["position"])

                        drivers_for_season = {d[0]: d for d in _get_drivers_for_season(season)}
                        fastest_lap_pos = 5
                        results = []
                        for item in raw_results:
                            pos = item["position"]
                            dn = item["driver_no"]
                            # Try matching by driver number using DRIVER_INFO from livef1_client
                            try:
                                dn_int = int(dn)
                            except ValueError:
                                dn_int = 0
                            tla = str(dn)
                            name = f"Driver {dn}"
                            team = "Unknown"
                            results.append({
                                "position": pos,
                                "driver": tla,
                                "driver_name": name,
                                "team": team,
                                "time": "",
                                "points": _points_for_position(pos),
                                "fastest_lap": (pos == fastest_lap_pos),
                            })

                        if results:
                            return {
                                "season": season,
                                "round": round_num,
                                "name": race_info["name"],
                                "circuit": race_info["circuit"],
                                "date": race_info["date"],
                                "results": results,
                            }
                except Exception as inner_exc:
                    logger.debug("livef1 inner parse error, falling back to mock: %s", inner_exc)
        except Exception as exc:
            logger.debug("livef1 session load failed for %d R%d, using mock: %s", season, round_num, exc)

    result = _mock_race_results(season, round_num, race_info)
    _RESULTS_CACHE[cache_key] = result
    return result


def head_to_head(driver_a: str, driver_b: str, season: int) -> Dict[str, Any]:
    """
    Compare two drivers across all races of a season.

    Uses mock results (same deterministic data as get_race_results).
    driver_a / driver_b should be three-letter driver codes (e.g. 'VER', 'HAM').
    """
    races = list_races(season)
    race_comparisons = []
    a_wins = 0
    b_wins = 0
    a_pos_sum = 0.0
    b_pos_sum = 0.0
    counted = 0

    driver_a_upper = driver_a.upper()
    driver_b_upper = driver_b.upper()

    for race in races:
        rnd = race["round"]
        result = _mock_race_results(season, rnd, race)

        a_pos = next(
            (r["position"] for r in result["results"] if r["driver"].upper() == driver_a_upper),
            None,
        )
        b_pos = next(
            (r["position"] for r in result["results"] if r["driver"].upper() == driver_b_upper),
            None,
        )

        if a_pos is None or b_pos is None:
            continue

        if a_pos < b_pos:
            winner = driver_a_upper
            a_wins += 1
        elif b_pos < a_pos:
            winner = driver_b_upper
            b_wins += 1
        else:
            winner = "tie"

        a_pos_sum += a_pos
        b_pos_sum += b_pos
        counted += 1

        race_comparisons.append({
            "round": rnd,
            "name": race["name"],
            "a_pos": a_pos,
            "b_pos": b_pos,
            "winner": winner,
        })

    a_avg = round(a_pos_sum / counted, 2) if counted else 0.0
    b_avg = round(b_pos_sum / counted, 2) if counted else 0.0

    return {
        "driver_a": driver_a_upper,
        "driver_b": driver_b_upper,
        "season": season,
        "races": race_comparisons,
        "summary": {
            "a_wins": a_wins,
            "b_wins": b_wins,
            "a_avg_pos": a_avg,
            "b_avg_pos": b_avg,
        },
    }
