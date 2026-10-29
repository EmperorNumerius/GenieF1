"""
openf1.py — stable, key-free data for everything that isn't the live feed.

Sources:
  * OpenF1 (https://openf1.org)  — calendar, sessions, laps, stints, weather,
    race control, positions. Historical data is free and needs no key.
  * Jolpica (https://api.jolpi.ca) — the maintained Ergast successor, used for
    race results and championship standings.

Everything is fetched over plain HTTPS and cached in-process with a TTL so a
Render free-tier instance doesn't hammer either API.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

OPENF1 = "https://api.openf1.org/v1"
JOLPICA = "https://api.jolpi.ca/ergast/f1"

_cache: Dict[str, tuple[float, Any]] = {}
_cache_lock = threading.Lock()
_client = httpx.Client(timeout=30.0, headers={"User-Agent": "GenieF1/1.1 (+https://f1.numeri.us)"})


# OpenF1's free tier allows ~3 requests/second; stay under it across threads.
_rate_lock = threading.Lock()
_last_call: Dict[str, float] = {}
_MIN_INTERVAL = {OPENF1: 0.4, JOLPICA: 0.3}


def _throttle(url: str) -> None:
    base = OPENF1 if url.startswith(OPENF1) else JOLPICA
    with _rate_lock:
        wait = _last_call.get(base, 0.0) + _MIN_INTERVAL[base] - time.time()
        if wait > 0:
            time.sleep(wait)
        _last_call[base] = time.time()


def _get(url: str, params: Optional[Dict[str, Any]] = None, ttl: float = 300.0) -> Any:
    """GET JSON with a small TTL cache. Returns None on failure."""
    key = url + "?" + "&".join(f"{k}={v}" for k, v in sorted((params or {}).items()))
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
    try:
        data: Any = None
        for attempt in range(4):
            _throttle(url)
            resp = _client.get(url, params=params)
            if resp.status_code == 429 and attempt < 3:
                wait = float(resp.headers.get("Retry-After") or 0) or 1.5 * (attempt + 1)
                time.sleep(min(wait, 10))
                continue
            if resp.status_code == 404:
                data = []
            else:
                resp.raise_for_status()
                data = resp.json()
            break
    except Exception as exc:  # network, JSON, 5xx, rate limit
        logger.warning("GET %s failed: %s", key, exc)
        with _cache_lock:
            stale = _cache.get(key)
        return stale[1] if stale else None
    with _cache_lock:
        _cache[key] = (now + ttl, data)
    return data


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Calendar ────────────────────────────────────────────────────────────────

def get_meetings(year: int) -> List[Dict[str, Any]]:
    """All race weekends for a season (testing excluded), with their sessions."""
    meetings = _get(f"{OPENF1}/meetings", {"year": year}, ttl=6 * 3600) or []
    sessions = _get(f"{OPENF1}/sessions", {"year": year}, ttl=1800) or []
    by_meeting: Dict[int, List[Dict[str, Any]]] = {}
    for s in sessions:
        by_meeting.setdefault(s.get("meeting_key"), []).append({
            "session_key": s.get("session_key"),
            "session_name": s.get("session_name"),
            "session_type": s.get("session_type"),
            "date_start": s.get("date_start"),
            "date_end": s.get("date_end"),
        })

    out = []
    for m in meetings:
        name = m.get("meeting_name") or ""
        if "testing" in name.lower():
            continue
        out.append({
            "meeting_key": m.get("meeting_key"),
            "meeting_name": name,
            "meeting_official_name": m.get("meeting_official_name") or name,
            "country_name": m.get("country_name"),
            "country_code": m.get("country_code"),
            "circuit_short_name": m.get("circuit_short_name"),
            "location": m.get("location"),
            "date_start": m.get("date_start"),
            "year": year,
            "sessions": sorted(by_meeting.get(m.get("meeting_key"), []), key=lambda s: s["date_start"] or ""),
        })
    out.sort(key=lambda m: m["date_start"] or "")

    # OpenF1 keeps cancelled weekends in its feed. Keep only meetings whose race
    # day matches a race on the official calendar (Jolpica), within a day.
    official = list_races(year)
    if official:
        race_days = {}
        for r in official:
            d = _parse_dt(f"{r['date']}T12:00:00+00:00") if r.get("date") else None
            if d:
                race_days[d.date().toordinal()] = r["round"]
        kept = []
        for m in out:
            race = next((s for s in m["sessions"] if s["session_name"] == "Race"), None)
            rd = _parse_dt(race["date_start"]) if race else None
            rnd = next((race_days[o] for o in (rd.date().toordinal() + k for k in (-1, 0, 1)) if o in race_days), None) if rd else None
            if rnd:
                m["round"] = rnd
                kept.append(m)
        if kept:
            return kept
    for i, m in enumerate(out, start=1):
        m["round"] = i
    return out


def next_session(year: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """The next session that hasn't started yet (for the 'next up' countdown)."""
    year = year or _now().year
    now = _now()
    for meeting in get_meetings(year) + (get_meetings(year + 1) if now.month >= 11 else []):
        for s in meeting["sessions"]:
            start = _parse_dt(s["date_start"])
            if start and start > now:
                return {**s, "meeting_name": meeting["meeting_name"], "circuit": meeting["circuit_short_name"],
                        "country_name": meeting["country_name"]}
    return None


def latest_completed_session(prefer_race: bool = False) -> Optional[Dict[str, Any]]:
    """Most recent session that has finished (testing excluded)."""
    now = _now()
    candidates = []
    for year in (now.year, now.year - 1):
        for s in _get(f"{OPENF1}/sessions", {"year": year}, ttl=900) or []:
            end = _parse_dt(s.get("date_end"))
            if not end or end > now:
                continue
            if prefer_race and s.get("session_type") != "Race":
                continue
            candidates.append((end, s))
        if candidates:
            break
    if not candidates:
        return None
    meetings = {m.get("meeting_key"): m for m in _get(f"{OPENF1}/meetings", {"year": candidates[0][1].get("year")}, ttl=6 * 3600) or []}
    # Skip pre-season testing — it rarely has classification data.
    candidates = [c for c in candidates if "testing" not in (meetings.get(c[1].get("meeting_key"), {}).get("meeting_name") or "").lower()] or candidates
    end, s = max(candidates, key=lambda c: c[0])
    m = meetings.get(s.get("meeting_key"), {})
    return {**s, "meeting_name": m.get("meeting_name"), "meeting_official_name": m.get("meeting_official_name")}


# ─── Session snapshot (dashboard fallback between race weekends) ─────────────

def _fmt_lap(seconds: Optional[float]) -> Optional[str]:
    if seconds is None:
        return None
    m, s = divmod(float(seconds), 60)
    return f"{int(m)}:{s:06.3f}" if m else f"{s:.3f}"


def _fmt_gap(gap: Any) -> Optional[str]:
    if gap is None:
        return None
    if isinstance(gap, (int, float)):
        return "LEADER" if gap == 0 else f"+{gap:.3f}"
    if isinstance(gap, list):  # qualifying returns [Q1, Q2, Q3]
        vals = [g for g in gap if g is not None]
        return _fmt_gap(vals[-1]) if vals else None
    return str(gap)


def _track_outline(session_key: int, driver_number: int, laps: List[Dict[str, Any]]) -> List[List[float]]:
    """Trace one clean lap of a driver's X/Y positions as the circuit outline."""
    clean = [l for l in laps if l.get("driver_number") == driver_number and l.get("lap_duration")
             and not l.get("is_pit_out_lap") and l.get("date_start")]
    if not clean:
        return []
    lap = min(clean[2:] or clean, key=lambda l: l["lap_duration"])  # fastest lap after the opening laps
    start = _parse_dt(lap["date_start"])
    if not start:
        return []
    end = start.timestamp() + float(lap["lap_duration"])
    end_iso = datetime.fromtimestamp(end, tz=timezone.utc).isoformat()
    pts = _get(f"{OPENF1}/location", {"session_key": session_key, "driver_number": driver_number,
                                      "date>": lap["date_start"], "date<": end_iso}, ttl=86400) or []
    outline = [[float(p["x"]), float(p["y"])] for p in pts if p.get("x") is not None and (p["x"] or p["y"])]
    # Downsample to keep the WebSocket payload small.
    step = max(1, len(outline) // 400)
    return outline[::step]


def _point_along(outline: List[List[float]], fraction: float) -> Dict[str, float]:
    if not outline:
        return {"x": 0.0, "y": 0.0, "z": 0.0}
    idx = int((fraction % 1.0) * len(outline)) % len(outline)
    x, y = outline[idx]
    return {"x": x, "y": y, "z": 0.0}


def session_snapshot(session: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build a final-classification snapshot of a finished session in the same shape
    as livef1_client.get_full_race_state(), so the dashboard can render it.
    """
    sk = session["session_key"]
    drivers = _get(f"{OPENF1}/drivers", {"session_key": sk}, ttl=86400) or []
    results = _get(f"{OPENF1}/session_result", {"session_key": sk}, ttl=3600) or []
    stints = _get(f"{OPENF1}/stints", {"session_key": sk}, ttl=3600) or []
    pits = _get(f"{OPENF1}/pit", {"session_key": sk}, ttl=3600) or []
    laps = _get(f"{OPENF1}/laps", {"session_key": sk}, ttl=3600) or []
    weather = _get(f"{OPENF1}/weather", {"session_key": sk}, ttl=3600) or []
    rc = _get(f"{OPENF1}/race_control", {"session_key": sk}, ttl=3600) or []

    if not results:  # e.g. a session OpenF1 hasn't classified yet — use last known positions
        last_pos: Dict[int, int] = {}
        for p in _get(f"{OPENF1}/position", {"session_key": sk}, ttl=3600) or []:
            last_pos[p["driver_number"]] = p["position"]
        results = [{"driver_number": dn, "position": pos} for dn, pos in last_pos.items()]

    res_by_dn = {r["driver_number"]: r for r in results}
    stints_by_dn: Dict[int, List[Dict[str, Any]]] = {}
    for s in stints:
        stints_by_dn.setdefault(s["driver_number"], []).append(s)
    pits_by_dn: Dict[int, int] = {}
    for p in pits:
        pits_by_dn[p["driver_number"]] = pits_by_dn.get(p["driver_number"], 0) + 1
    laps_by_dn: Dict[int, List[Dict[str, Any]]] = {}
    for l in laps:
        laps_by_dn.setdefault(l["driver_number"], []).append(l)

    winner = min(results, key=lambda r: r.get("position") or 99, default=None)
    outline = _track_outline(sk, winner["driver_number"], laps) if winner else []
    leader_laps = [l["lap_duration"] for l in laps_by_dn.get(winner["driver_number"] if winner else -1, []) if l.get("lap_duration")]
    ref_lap = sorted(leader_laps)[len(leader_laps) // 2] if leader_laps else 90.0

    cars: List[Dict[str, Any]] = []
    prev_gap: Optional[float] = 0.0
    for d in sorted(drivers, key=lambda d: (res_by_dn.get(d["driver_number"], {}).get("position") or 99)):
        dn = d["driver_number"]
        res = res_by_dn.get(dn, {})
        dstints = sorted(stints_by_dn.get(dn, []), key=lambda s: s.get("stint_number") or 0)
        last_stint = dstints[-1] if dstints else {}
        dlaps = sorted(laps_by_dn.get(dn, []), key=lambda l: l.get("lap_number") or 0)
        timed = [l for l in dlaps if l.get("lap_duration")]
        last_lap = timed[-1] if timed else {}
        best = min((l["lap_duration"] for l in timed), default=None)

        gap = res.get("gap_to_leader")
        gap_num = gap if isinstance(gap, (int, float)) else None
        interval = None
        if gap_num is not None and prev_gap is not None:
            interval = "LEADER" if gap_num == 0 else f"+{gap_num - prev_gap:.3f}"
        elif isinstance(gap, str):
            interval = gap
        prev_gap = gap_num if gap_num is not None else None

        status = "DNF" if res.get("dnf") else "DNS" if res.get("dns") else "DSQ" if res.get("dsq") else None
        tire_age = 0
        if last_stint:
            tire_age = (last_stint.get("tyre_age_at_start") or 0) + max(0, (last_stint.get("lap_end") or 0) - (last_stint.get("lap_start") or 0) + 1)

        # Spread cars around the outline by their gap so the map isn't a pile-up.
        frac = 0.0 if not gap_num else -(gap_num / ref_lap)
        colour = d.get("team_colour") or ""

        cars.append({
            "id": d.get("name_acronym") or str(dn),
            "number": dn,
            "name": f"{d.get('first_name', '')} {d.get('last_name', '')}".strip() or d.get("full_name") or f"Driver {dn}",
            "team": d.get("team_name") or "",
            "color": f"#{colour}" if colour and not colour.startswith("#") else colour or "#888888",
            "country_code": d.get("country_code") or "",
            "headshot_url": d.get("headshot_url"),
            "pos": res.get("position") or 0,
            "speed": 0, "rpm": 0, "gear": 0, "throttle": 0, "brake": 0, "drs": 0,
            "interval": status or interval,
            "gap_to_leader": status or _fmt_gap(gap),
            "tire": (last_stint.get("compound") or "Unknown").upper(),
            "tire_age": tire_age,
            "stint_laps": len(dstints),
            "pits": pits_by_dn.get(dn, 0),
            "last_lap_time": _fmt_lap(last_lap.get("lap_duration")),
            "best_lap_time": _fmt_lap(best),
            "lap_number": res.get("number_of_laps") or (dlaps[-1]["lap_number"] if dlaps else 0),
            "sector_1": _fmt_lap(last_lap.get("duration_sector_1")),
            "sector_2": _fmt_lap(last_lap.get("duration_sector_2")),
            "sector_3": _fmt_lap(last_lap.get("duration_sector_3")),
            "pos_diff": None,
            "status": status,
            "location": _point_along(outline, frac) if not status else {"x": 0.0, "y": 0.0, "z": 0.0},
            "telemetry_timestamp": None,
        })
    # Unclassified cars (DNF/DNS/DSQ) come back with no position: put them at the
    # back, ordered by laps completed, so every row has a real P-number.
    classified = sorted([c for c in cars if c["pos"] > 0], key=lambda c: c["pos"])
    unclassified = sorted([c for c in cars if c["pos"] <= 0], key=lambda c: -(c["lap_number"] or 0))
    for i, c in enumerate(unclassified, start=len(classified) + 1):
        c["pos"] = i
    cars = classified + unclassified

    w = weather[-1] if weather else None
    total_laps = max((c["lap_number"] for c in cars), default=0)
    return {
        "cars": cars,
        "weather": {
            "air_temp": w.get("air_temperature"), "track_temp": w.get("track_temperature"),
            "humidity": w.get("humidity"), "wind_speed": w.get("wind_speed"), "rainfall": bool(w.get("rainfall")),
        } if w else None,
        "race_control": [
            {"message": m.get("message", ""), "category": m.get("category", ""), "flag": m.get("flag") or "", "scope": m.get("scope") or ""}
            for m in rc[-8:]
        ],
        "track_outline": outline,
        "position_trails": {},
        "lap": total_laps,
        "total_laps": total_laps,
        "session": {
            "key": sk,
            "name": session.get("session_name"),
            "type": session.get("session_type"),
            "circuit": session.get("circuit_short_name"),
            "country": session.get("country_name"),
            "meeting_name": session.get("meeting_name"),
            "meeting_official_name": session.get("meeting_official_name") or session.get("meeting_name"),
            "status": "Finished",
            "year": session.get("year"),
            "date_start": session.get("date_start"),
            "date_end": session.get("date_end"),
        },
        "updated_at": session.get("date_end"),
    }


# ─── Historical results & standings (Jolpica) ────────────────────────────────

def _jolpica(path: str, ttl: float = 1800) -> Dict[str, Any]:
    data = _get(f"{JOLPICA}/{path}.json", {"limit": 100}, ttl=ttl) or {}
    return data.get("MRData", {})


def list_seasons() -> List[int]:
    this_year = _now().year
    return list(range(2018, this_year + 1))


def list_races(season: int) -> List[Dict[str, Any]]:
    races = _jolpica(f"{season}/races", ttl=6 * 3600).get("RaceTable", {}).get("Races", [])
    return [{
        "round": int(r["round"]),
        "name": r.get("raceName"),
        "country": r.get("Circuit", {}).get("Location", {}).get("country"),
        "circuit": r.get("Circuit", {}).get("circuitName"),
        "date": r.get("date"),
    } for r in races]


def race_results(season: int, round_num: int) -> Dict[str, Any]:
    races = _jolpica(f"{season}/{round_num}/results").get("RaceTable", {}).get("Races", [])
    if not races:
        info = next((r for r in list_races(season) if r["round"] == round_num), {})
        return {"season": season, "round": round_num, "name": info.get("name"), "circuit": info.get("circuit"),
                "date": info.get("date"), "results": [], "status": "not_run_yet"}
    race = races[0]
    results = []
    for r in race.get("Results", []):
        drv = r.get("Driver", {})
        results.append({
            "position": int(r["position"]),
            "driver": drv.get("code") or drv.get("familyName", "")[:3].upper(),
            "driver_name": f"{drv.get('givenName', '')} {drv.get('familyName', '')}".strip(),
            "team": r.get("Constructor", {}).get("name"),
            "grid": int(r.get("grid") or 0),
            "laps": int(r.get("laps") or 0),
            "status": r.get("status"),
            "time": (r.get("Time") or {}).get("time") or r.get("status"),
            "points": float(r.get("points") or 0),
            "fastest_lap": (r.get("FastestLap") or {}).get("rank") == "1",
        })
    return {"season": season, "round": int(race["round"]), "name": race.get("raceName"),
            "circuit": race.get("Circuit", {}).get("circuitName"), "date": race.get("date"), "results": results}


def driver_standings(season: int) -> List[Dict[str, Any]]:
    lists = _jolpica(f"{season}/driverstandings").get("StandingsTable", {}).get("StandingsLists", [])
    if not lists:
        return []
    podiums = _podium_counts(season)
    out = []
    for s in lists[0].get("DriverStandings", []):
        drv = s.get("Driver", {})
        code = drv.get("code") or drv.get("familyName", "")[:3].upper()
        out.append({
            "position": int(s.get("position") or s.get("positionText", "0").replace("-", "0") or 0),
            "driver": code,
            "driver_name": f"{drv.get('givenName', '')} {drv.get('familyName', '')}".strip(),
            "team": (s.get("Constructors") or [{}])[-1].get("name"),
            "points": float(s.get("points") or 0),
            "wins": int(s.get("wins") or 0),
            "podiums": podiums.get(code, 0),
            "round": int(lists[0].get("round") or 0),
        })
    return out


def constructor_standings(season: int) -> List[Dict[str, Any]]:
    lists = _jolpica(f"{season}/constructorstandings").get("StandingsTable", {}).get("StandingsLists", [])
    if not lists:
        return []
    return [{
        "position": int(s.get("position") or 0),
        "team": s.get("Constructor", {}).get("name"),
        "points": float(s.get("points") or 0),
        "wins": int(s.get("wins") or 0),
        "round": int(lists[0].get("round") or 0),
    } for s in lists[0].get("ConstructorStandings", [])]


def _season_results(season: int) -> List[Dict[str, Any]]:
    """Every race result of a season (paged; Jolpica caps at 100 rows per call)."""
    races: Dict[str, Dict[str, Any]] = {}
    offset = 0
    while True:
        data = _get(f"{JOLPICA}/{season}/results.json", {"limit": 100, "offset": offset}, ttl=1800) or {}
        mr = data.get("MRData", {})
        for race in mr.get("RaceTable", {}).get("Races", []):
            existing = races.setdefault(race["round"], {**race, "Results": []})
            existing["Results"].extend(race.get("Results", []))
        total = int(mr.get("total") or 0)
        offset += 100
        if offset >= total or not mr:
            break
    return [races[k] for k in sorted(races, key=int)]


def _podium_counts(season: int) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for race in _season_results(season):
        for r in race.get("Results", []):
            if r.get("position") in ("1", "2", "3"):
                code = r.get("Driver", {}).get("code", "")
                counts[code] = counts.get(code, 0) + 1
    return counts


def head_to_head(driver_a: str, driver_b: str, season: int) -> Dict[str, Any]:
    a, b = driver_a.upper(), driver_b.upper()
    rows, a_wins, b_wins, a_pos, b_pos = [], 0, 0, [], []
    for race in _season_results(season):
        pos = {r.get("Driver", {}).get("code", "").upper(): int(r["position"]) for r in race.get("Results", [])}
        if a not in pos or b not in pos:
            continue
        winner = a if pos[a] < pos[b] else b
        a_wins += winner == a
        b_wins += winner == b
        a_pos.append(pos[a])
        b_pos.append(pos[b])
        rows.append({"round": int(race["round"]), "name": race.get("raceName"), "a_pos": pos[a], "b_pos": pos[b], "winner": winner})
    return {"driver_a": a, "driver_b": b, "season": season, "races": rows,
            "summary": {"a_wins": a_wins, "b_wins": b_wins,
                        "a_avg_pos": round(sum(a_pos) / len(a_pos), 2) if a_pos else 0.0,
                        "b_avg_pos": round(sum(b_pos) / len(b_pos), 2) if b_pos else 0.0}}
