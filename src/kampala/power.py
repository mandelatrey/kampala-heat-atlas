"""Power cuts by area: how many days a week the power goes off, from a log of reported cuts and the periods each
area was watched, and a small model that estimates places nobody watched, published only when it predicts held-out
areas better than the plain average does.

The log (config/power/outage_log.csv) has one row per reported cut (several reports of the same day count once):
  area       neighbourhood name as people use it; matched to docs/atlas/places.json when lat/lon are empty
  lat, lon   optional, decimal degrees
  date       YYYY-MM-DD
  hours_off  hours without power that day, if known (blank is fine: most complaints do not say). 0 = power stayed on
  cuts       separate cuts that day (optional)
  kind       planned | unplanned | unknown
  start, end optional HH:MM, e.g. a planned cut's announced window
  source     a plain label: "X complaint to UEDCL", "UEDCL notice", "resident diary". Labels that look like a link or
             an @handle are not published
  notes      free text, not published. No personal names, handles or phone numbers: the repository is public
Rows dated after today with kind "planned" are upcoming planned cuts (advisories), not part of any rate.

The sampling periods (config/power/sampling.csv: area,lat,lon,from,to,source) say which areas were watched over which
dates. Inside a period, a day with no reported cut counts as a day the power stayed on. An area watched with no reports
at all counts as no cuts. An `area` of "*" sets the period for every area without its own. An area with reports but no
period is shown as "reports only" (its first to last report would overstate the rate) and kept out of the model.

Used by scripts/33_power.py; the page's reader is web/src/power/cuts.ts.
"""
from __future__ import annotations

import csv
import math
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import numpy as np

COLUMNS = ["area", "lat", "lon", "date", "hours_off", "cuts", "kind", "start", "end", "source", "notes"]
SAMPLING_COLUMNS = ["area", "lat", "lon", "from", "to", "source"]
KINDS = {"planned", "unplanned", "unknown"}
CBD = (0.3136, 32.5811)              # Kampala's centre (OpenStreetMap's city node)
FEATURES = ["built", "new_built", "trees", "informal", "dist_cbd_km"]
MIN_AREAS = 6                        # fewer sampled areas than this: no estimates at all
MUST_BEAT = 0.9                      # a model must cut the average's held-out error by at least 10 %
MIN_DAYS = 7                         # an area needs a week of watching to enter the model


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
    features: dict[str, float] = field(default_factory=dict)

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
        rows.append(Row(area, _num(r.get("lat", ""), "lat", line), _num(r.get("lon", ""), "lon", line), day, hours,
                        None if cuts is None else int(cuts), kind, (r.get("start") or "").strip(), (r.get("end") or "").strip(),
                        (r.get("source") or "").strip()))
    return rows


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


# ---- what each place is like, from the atlas layers

def shares(lc: np.ndarray, growth: np.ndarray, informal: np.ndarray) -> dict[str, float]:
    """Features from the land-cover, growth and housing classes inside one circle (class codes as in atlas.json)."""
    land = lc > 0
    n = max(int(land.sum()), 1)
    built = np.isin(lc, (1, 2))
    grown = growth > 0
    return dict(
        built=float(built.sum() / n),
        new_built=float(np.isin(growth, (2, 3)).sum() / max(int(grown.sum()), 1)),
        trees=float((lc == 3).sum() / n),
        informal=float((informal == 1).sum() / n),
    )


def disk(radius_cells: float) -> tuple[np.ndarray, np.ndarray]:
    r = int(math.ceil(radius_cells))
    dy, dx = np.mgrid[-r:r + 1, -r:r + 1]
    keep = dy ** 2 + dx ** 2 <= radius_cells ** 2
    return dy[keep], dx[keep]


def features_at(row: float, col: float, layers: dict[str, np.ndarray], offsets: tuple[np.ndarray, np.ndarray],
                lat: float, lon: float) -> dict[str, float] | None:
    """Features in the circle around grid cell (row, col), or None when the circle is off the grid."""
    h, w = layers["lc"].shape
    rr = np.round(row).astype(int) + offsets[0]
    cc = np.round(col).astype(int) + offsets[1]
    ok = (rr >= 0) & (rr < h) & (cc >= 0) & (cc < w)
    if ok.mean() < 0.5:
        return None
    rr, cc = rr[ok], cc[ok]
    f = shares(layers["lc"][rr, cc], layers["growth"][rr, cc], layers["informal"][rr, cc])
    f["dist_cbd_km"] = km((lat, lon), CBD)
    return f


# ---- the model

def _ridge_fit(X: np.ndarray, y: np.ndarray, alpha: float):
    mu, sd = X.mean(axis=0), X.std(axis=0)
    sd[sd == 0] = 1
    Z = (X - mu) / sd
    beta = np.linalg.solve(Z.T @ Z + alpha * np.eye(Z.shape[1]), Z.T @ (y - y.mean()))
    return lambda Xn: y.mean() + ((Xn - mu) / sd) @ beta


def _idw(train: list[tuple[float, float]], y: np.ndarray, power: float = 2.0):
    def predict(points: list[tuple[float, float]]) -> np.ndarray:
        out = []
        for p in points:
            d = np.array([max(km(p, q), 0.2) for q in train])
            wgt = d ** -power
            out.append(float((wgt * y).sum() / wgt.sum()))
        return np.array(out)
    return predict


@dataclass
class Model:
    chosen: str
    used: bool
    n: int
    loo_mae: dict[str, float]
    predict: object = None          # (points, feature matrix) -> cut days a week

    def summary(self) -> dict:
        return dict(chosen=self.chosen, used=self.used, areas=self.n, loo_mae_cut_days_week={k: round(v, 2) for k, v in self.loo_mae.items()})


def choose_model(train: list[Area], alpha: float = 2.0) -> Model:
    """Leave-one-area-out error in cut days a week for the average, nearest areas (inverse distance) and a ridge
    regression on the place features, over sampled areas watched for at least MIN_DAYS; the best is used only with
    enough areas and when it beats the average by MUST_BEAT."""
    use = [a for a in train if a.sampled and a.days >= MIN_DAYS and a.features]
    n = len(use)
    if n < 3:
        return Model("average", False, n, {})
    y = np.array([a.cut_days_week for a in use])
    pts = [(a.lat, a.lon) for a in use]
    X = np.array([[a.features[f] for f in FEATURES] for a in use])
    errs = {"average": [], "nearest areas": [], "area features": []}
    for i in range(n):
        keep = [j for j in range(n) if j != i]
        errs["average"].append(abs(y[keep].mean() - y[i]))
        errs["nearest areas"].append(abs(_idw([pts[j] for j in keep], y[keep])([pts[i]])[0] - y[i]))
        errs["area features"].append(abs(_ridge_fit(X[keep], y[keep], alpha)(X[i:i + 1])[0] - y[i]))
    mae = {k: float(np.mean(v)) for k, v in errs.items()}
    best = min(("nearest areas", "area features"), key=lambda k: mae[k])
    used = n >= MIN_AREAS and mae[best] <= MUST_BEAT * mae["average"]
    if best == "nearest areas":
        f = _idw(pts, y)
        predict = lambda points, _X: f(points)            # noqa: E731
    else:
        g = _ridge_fit(X, y, alpha)
        predict = lambda _points, Xn: g(Xn)                # noqa: E731
    return Model(best if used else "average", used, n, mae, predict if used else None)
