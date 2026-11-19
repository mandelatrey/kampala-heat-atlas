"""Power cuts for the atlas: reported cuts by area (and a rate where an area was watched over a declared period),
upcoming planned cuts, when in the day cuts are reported, and published figures (utility records in studies, news).

There is no estimate for areas nobody logged: cuts depend on the feeder line a building is on (its length, loading
and equipment), which the atlas cannot see, so the page shows measured figures for the areas studies cover and a
typical Kampala range elsewhere.

The log (config/power/outage_log.csv) has one row per reported cut (several reports of the same day count once):
  area       neighbourhood name as people use it; matched to docs/atlas/places.json when lat/lon are empty
  lat, lon   optional, decimal degrees
  date       YYYY-MM-DD
  hours_off  hours without power that day, if known (blank is fine: most complaints do not say). 0 = power stayed on
  cuts       separate cuts that day (optional)
  kind       planned | unplanned | unknown
  start, end optional HH:MM, e.g. a planned cut's announced window
  reported   optional HH:MM: when the cut was reported (e.g. the complaint's time), for when in the day cuts happen
  source     a plain label: "X complaint to UEDCL", "UEDCL notice", "resident diary". Labels that look like a link or
             an @handle are not published
  notes      free text, not published. No personal names, handles or phone numbers: the repository is public
Rows dated after today with kind "planned" are upcoming planned cuts (advisories), not part of any rate.

The sampling periods (config/power/sampling.csv: area,lat,lon,from,to,source) say which areas were watched over which
dates. Inside a period, a day with no reported cut counts as a day the power stayed on. An area watched with no reports
at all counts as no cuts. An `area` of "*" sets the period for every area without its own. An area with reports but no
period is shown as "reports only": its first to last report would overstate the rate.

Used by scripts/33_power.py; the page's reader is web/src/power/cuts.ts.
"""
from __future__ import annotations

import csv
import math
import re
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import numpy as np

COLUMNS = ["area", "lat", "lon", "date", "hours_off", "cuts", "kind", "start", "end", "reported", "source", "notes"]
PUBLISHED_COLUMNS = ["areas", "lat", "lon", "radius_km", "from", "to", "cuts_per_month", "hours_per_month", "basis",
                     "qualifier", "label", "source", "url", "note"]
BASES = {"measured", "reported"}     # measured: utility outage records; reported: news, residents
SAMPLING_COLUMNS = ["area", "lat", "lon", "from", "to", "source"]
KINDS = {"planned", "unplanned", "unknown"}


@dataclass
class Row:
    area: str
    lat: float | None
    lon: float | None
    day: date
    hours_off: float | None
    cuts: int | None
    kind: str
    start: str
    end: str
    source: str
    reported: str = ""


@dataclass
class Window:
    area: str                        # "*" = every area without its own period
    lat: float | None
    lon: float | None
    start: date
    end: date
    source: str


@dataclass
class Area:
    name: str
    lat: float
    lon: float
    basis: str                       # "sampled" (a declared period) or "reports only"
    first: str
    last: str
    days: int                        # days in the period (up to today)
    cut_days: int                    # days in it with a reported cut
    cut_days_week: float
    hours_week: float | None         # only when every cut day says how long it lasted
    kinds: dict[str, int]
    sources: list[str]

    @property
    def sampled(self) -> bool:
        return self.basis == "sampled"


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    dy = (a[0] - b[0]) * 111.32
    dx = (a[1] - b[1]) * 111.32 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


def public_source(label: str) -> str | None:
    """A source label fit to publish: nothing that looks like a link, an @handle, an email or a phone number."""
    label = label.strip()
    if not label or re.search(r"https?://|www\.|@\w|\b(t\.co|x\.com|twitter\.com)\b|\+?\d(?:[\s-]?\d){8,}", label, re.I):
        return None
    return label


def _num(v: str, what: str, line: int) -> float | None:
    v = (v or "").strip()
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        raise ValueError(f"line {line}: {what} '{v}' is not a number") from None


def _day(v: str, what: str, line: int) -> date:
    try:
        return date.fromisoformat((v or "").strip())
    except ValueError:
        raise ValueError(f"line {line}: {what} '{v}' is not YYYY-MM-DD") from None


def _rows(path: Path, required: tuple[str, ...], columns: list[str]):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = [c for c in required if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path}: missing column(s) {', '.join(missing)}; expected {','.join(columns)}")
        for line, r in enumerate(reader, start=2):
            if any((v or "").strip() for v in r.values() if isinstance(v, str)):
                yield line, r


def read_log(path: Path) -> list[Row]:
    """The log's rows, checked; raises ValueError naming the line of the first problem."""
    rows = []
    for line, r in _rows(path, ("area", "date"), COLUMNS):
        area = (r.get("area") or "").strip()
        if not area:
            raise ValueError(f"line {line}: no area")
        day = _day(r.get("date", ""), "date", line)
        hours = _num(r.get("hours_off", ""), "hours_off", line)
        if hours is not None and not 0 <= hours <= 24:
            raise ValueError(f"line {line}: hours_off must be 0 to 24")
        kind = (r.get("kind") or "unknown").strip().lower() or "unknown"
        if kind not in KINDS:
            raise ValueError(f"line {line}: kind '{kind}' should be one of {', '.join(sorted(KINDS))}")
        cuts = _num(r.get("cuts", ""), "cuts", line)
        reported = (r.get("reported") or "").strip()
        if reported and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", reported):
            raise ValueError(f"line {line}: reported '{reported}' should be HH:MM (24-hour)")
        rows.append(Row(area, _num(r.get("lat", ""), "lat", line), _num(r.get("lon", ""), "lon", line), day, hours,
                        None if cuts is None else int(cuts), kind, (r.get("start") or "").strip(), (r.get("end") or "").strip(),
                        (r.get("source") or "").strip(), reported))
    return rows


def reported_hours(rows: list[Row]) -> list[int]:
    """How many reported cuts (not planned ones, not power-on days) were reported in each hour of the day."""
    out = [0] * 24
    for r in rows:
        if r.reported and r.kind != "planned" and r.hours_off != 0:
            out[int(r.reported[:2])] += 1
    return out


def read_published(path: Path, places: list[dict]) -> list[dict]:
    """Published figures: cuts (and hours) a month for named areas over a period, shown within radius_km of their
    location, which defaults to the middle of the named areas found in the place list."""
    by_name = {}
    for p in sorted(places, key=lambda p: p.get("rank", 9)):
        by_name.setdefault(p["name"].casefold(), p)
    out = []
    for line, r in _rows(path, ("areas", "from", "to", "cuts_per_month", "basis", "source"), PUBLISHED_COLUMNS):
        names = [a.strip() for a in (r.get("areas") or "").split(";") if a.strip()]
        lat, lon = _num(r.get("lat", ""), "lat", line), _num(r.get("lon", ""), "lon", line)
        if lat is None or lon is None:
            hits = [by_name[n.casefold()] for n in names if n.casefold() in by_name]
            if not hits:
                raise ValueError(f"line {line}: none of {names} is in places.json; give lat and lon")
            lat, lon = float(np.mean([h["lat"] for h in hits])), float(np.mean([h["lon"] for h in hits]))
        basis = (r.get("basis") or "").strip()
        if basis not in BASES:
            raise ValueError(f"line {line}: basis should be one of {', '.join(sorted(BASES))}")
        cuts = _num(r.get("cuts_per_month", ""), "cuts_per_month", line)
        hours = _num(r.get("hours_per_month", ""), "hours_per_month", line)
        out.append(dict(areas=names, lat=round(lat, 5), lon=round(lon, 5), radius_km=_num(r.get("radius_km", ""), "radius_km", line) or 3.0,
                        **{"from": _day(r.get("from", ""), "from", line).isoformat()}, to=_day(r.get("to", ""), "to", line).isoformat(),
                        cuts_per_month=cuts, hours_per_month=hours,
                        hours_per_cut=round(hours / cuts, 2) if hours and cuts else None, basis=basis,
                        qualifier=(r.get("qualifier") or "").strip(), label=(r.get("label") or "").strip(),
                        source=(r.get("source") or "").strip(), url=(r.get("url") or "").strip(), note=(r.get("note") or "").strip()))
    return out


def read_sampling(path: Path) -> list[Window]:
    """The sampling periods, checked."""
    out = []
    for line, r in _rows(path, ("area", "from", "to"), SAMPLING_COLUMNS):
        area = (r.get("area") or "").strip()
        if not area:
            raise ValueError(f"line {line}: no area (use * for every area)")
        a, b = _day(r.get("from", ""), "from", line), _day(r.get("to", ""), "to", line)
        if b < a:
            raise ValueError(f"line {line}: 'to' is before 'from'")
        out.append(Window(area, _num(r.get("lat", ""), "lat", line), _num(r.get("lon", ""), "lon", line), a, b, (r.get("source") or "").strip()))
    return out


def locate(items: list, places: list[dict]) -> list[str]:
    """Fill in lat/lon (rows or windows) from the place list by name, biggest place first; returns names not found."""
    by_name: dict[str, dict] = {}
    for p in sorted(places, key=lambda p: p.get("rank", 9)):
        by_name.setdefault(p["name"].casefold(), p)
    unknown = set()
    for r in items:
        if r.area == "*" or (r.lat is not None and r.lon is not None):
            continue
        p = by_name.get(r.area.casefold())
        if p:
            r.lat, r.lon = p["lat"], p["lon"]
        else:
            unknown.add(r.area)
    return sorted(unknown)


def _days(windows: list[Window], today: date) -> set[date]:
    out: set[date] = set()
    for w in windows:
        d = w.start
        while d <= min(w.end, today):
            out.add(d)
            d += timedelta(days=1)
    return out


def areas(rows: list[Row], windows: list[Window], today: date) -> list[Area]:
    """Per area: the days watched, the days with a reported cut among them, and the rates that gives."""
    everywhere = [w for w in windows if w.area == "*"]
    names = sorted({r.area for r in rows if r.lat is not None} | {w.area for w in windows if w.area != "*" and w.lat is not None}, key=str.casefold)
    out = []
    for name in names:
        rs = [r for r in rows if r.area == name and r.lat is not None and r.day <= today]
        own = [w for w in windows if w.area == name and w.lat is not None]
        period = own or everywhere
        cut_dates = {r.day for r in rs if r.hours_off != 0}
        if period:
            watched = _days(period, today)
            basis = "sampled"
        elif cut_dates:
            watched = _days([Window(name, None, None, min(cut_dates), max(cut_dates), "")], today)
            basis = "reports only"
        else:
            continue
        if not watched:
            continue
        cut_days = sorted(d for d in cut_dates if d in watched)
        # hours: the longest report of each cut day; a rate only if every cut day has one
        hours = {}
        for r in rs:
            if r.day in cut_dates and r.day in watched and r.hours_off is not None:
                hours[r.day] = max(hours.get(r.day, 0.0), r.hours_off)
        kinds = {k: len({r.day for r in rs if r.kind == k and r.day in cut_dates and r.day in watched}) for k in sorted(KINDS)}
        pts = [(r.lat, r.lon) for r in rs] + [(w.lat, w.lon) for w in own]
        labels = {x for x in (public_source(r.source) for r in rs) if x} | {x for x in (public_source(w.source) for w in period) if x}
        n = len(watched)
        out.append(Area(
            name=name, lat=float(np.mean([p[0] for p in pts])), lon=float(np.mean([p[1] for p in pts])), basis=basis,
            first=min(watched).isoformat(), last=max(watched).isoformat(), days=n, cut_days=len(cut_days),
            cut_days_week=7 * len(cut_days) / n,
            hours_week=7 * sum(hours.values()) / n if len(hours) == len(cut_days) else None,
            kinds=kinds, sources=sorted(labels)[:6],
        ))
    return out


def hours_per_cut_day(rows: list[Row]) -> float | None:
    """Median length of a reported cut day, from the reports that give one."""
    h = [r.hours_off for r in rows if r.hours_off]
    return float(np.median(h)) if h else None


def upcoming(rows: list[Row], today: date) -> list[dict]:
    """Planned cuts from today on, soonest first."""
    return [dict(area=r.area, lat=r.lat, lon=r.lon, date=r.day.isoformat(), start=r.start, end=r.end, hours=r.hours_off,
                 source=public_source(r.source) or "")
            for r in sorted(rows, key=lambda r: (r.day, r.start, r.area)) if r.kind == "planned" and r.day >= today and r.lat is not None]
