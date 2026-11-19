"""Power cuts by area: hours a week without grid power, from a diary-style log, and a small model that estimates
places nobody logged, published only when it predicts held-out areas better than the plain average does.

The log (config/power/outage_log.csv) has one row per area per day checked:
  area       neighbourhood name as people use it; matched to docs/atlas/places.json when lat/lon are empty
  lat, lon   optional, decimal degrees
  date       YYYY-MM-DD
  hours_off  hours without grid power that day, 0 when the power stayed on. The zero days matter: without them
             there is no rate, only a list of cuts
  cuts       separate cuts that day (optional)
  kind       planned | unplanned | unknown
  start, end optional HH:MM, e.g. a planned cut's announced window
  source     where it came from: "UEDCL notice", a news link, "resident diary", ...
  notes      free text. No personal names or phone numbers: what this produces is public
Rows dated after today with kind "planned" are upcoming planned cuts (advisories), not part of any rate.

Used by scripts/33_power.py; the page's reader is web/src/power/cuts.ts.
"""
from __future__ import annotations

import csv
import math
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import numpy as np

COLUMNS = ["area", "lat", "lon", "date", "hours_off", "cuts", "kind", "start", "end", "source", "notes"]
KINDS = {"planned", "unplanned", "unknown"}
CBD = (0.3136, 32.5811)              # Kampala's centre (OpenStreetMap's city node)
FEATURES = ["built", "new_built", "trees", "informal", "dist_cbd_km"]
MIN_AREAS = 6                        # fewer diary areas than this: no estimates at all
MUST_BEAT = 0.9                      # a model must cut the average's held-out error by at least 10 %


@dataclass
class Row:
    area: str
    lat: float | None
    lon: float | None
    day: date
    hours_off: float
    cuts: int | None
    kind: str
    start: str
    end: str
    source: str


@dataclass
class Area:
    name: str
    lat: float
    lon: float
    days: int
    zero_days: int
    hours_week: float
    cuts_week: float | None
    kinds: dict[str, int]
    first: str
    last: str
    sources: list[str]
    features: dict[str, float] = field(default_factory=dict)

    @property
    def diary(self) -> bool:
        """A real rate needs days checked when the power stayed on; reports of cuts alone overstate it."""
        return self.zero_days > 0


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    dy = (a[0] - b[0]) * 111.32
    dx = (a[1] - b[1]) * 111.32 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


def _num(v: str, what: str, line: int) -> float | None:
    v = (v or "").strip()
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        raise ValueError(f"line {line}: {what} '{v}' is not a number") from None


def read_log(path: Path) -> list[Row]:
    """The log's rows, checked; raises ValueError naming the line of the first problem."""
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = [c for c in ("area", "date", "hours_off") if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path}: missing column(s) {', '.join(missing)}; expected {','.join(COLUMNS)}")
        for line, r in enumerate(reader, start=2):
            if not any((v or "").strip() for v in r.values()):
                continue
            area = (r.get("area") or "").strip()
            if not area:
                raise ValueError(f"line {line}: no area")
            try:
                day = date.fromisoformat((r.get("date") or "").strip())
            except ValueError:
                raise ValueError(f"line {line}: date '{r.get('date')}' is not YYYY-MM-DD") from None
            hours = _num(r.get("hours_off", ""), "hours_off", line)
            if hours is None or not 0 <= hours <= 24:
                raise ValueError(f"line {line}: hours_off must be 0 to 24")
            kind = (r.get("kind") or "unknown").strip().lower() or "unknown"
            if kind not in KINDS:
                raise ValueError(f"line {line}: kind '{kind}' should be one of {', '.join(sorted(KINDS))}")
            cuts = _num(r.get("cuts", ""), "cuts", line)
            rows.append(Row(area, _num(r.get("lat", ""), "lat", line), _num(r.get("lon", ""), "lon", line), day, hours,
                            None if cuts is None else int(cuts), kind, (r.get("start") or "").strip(), (r.get("end") or "").strip(),
                            (r.get("source") or "").strip()))
    return rows


def locate(rows: list[Row], places: list[dict]) -> list[str]:
    """Fill in lat/lon from the place list by name (biggest place first); returns the names that matched nothing."""
    by_name: dict[str, dict] = {}
    for p in sorted(places, key=lambda p: p.get("rank", 9)):
        by_name.setdefault(p["name"].casefold(), p)
    unknown = set()
    for r in rows:
        if r.lat is not None and r.lon is not None:
            continue
        p = by_name.get(r.area.casefold())
        if p:
            r.lat, r.lon = p["lat"], p["lon"]
        else:
            unknown.add(r.area)
    return sorted(unknown)


def areas(rows: list[Row], today: date) -> list[Area]:
    """Per area: days logged (up to today), the share with no power, hours a week, and where the records came from."""
    out = []
    names = sorted({r.area for r in rows if r.lat is not None}, key=str.casefold)
    for name in names:
        rs = [r for r in rows if r.area == name and r.lat is not None and r.day <= today]
        if not rs:
            continue
        # one figure per day, if a day was logged twice (two sources) keep the longer
        per_day: dict[date, Row] = {}
        for r in rs:
            if r.day not in per_day or r.hours_off > per_day[r.day].hours_off:
                per_day[r.day] = r
        days = list(per_day.values())
        cut_counts = [r.cuts for r in days if r.cuts is not None]
        kinds = {k: sum(1 for r in days if r.kind == k and r.hours_off > 0) for k in sorted(KINDS)}
        out.append(Area(
            name=name, lat=float(np.mean([r.lat for r in rs])), lon=float(np.mean([r.lon for r in rs])),
            days=len(days), zero_days=sum(1 for r in days if r.hours_off == 0),
            hours_week=7 * float(np.mean([r.hours_off for r in days])),
            cuts_week=7 * float(np.mean(cut_counts)) if len(cut_counts) == len(days) else None,
            kinds=kinds, first=min(per_day).isoformat(), last=max(per_day).isoformat(),
            sources=sorted({r.source for r in rs if r.source})[:6],
        ))
    return out


def upcoming(rows: list[Row], today: date) -> list[dict]:
    """Planned cuts from today on, soonest first."""
    return [dict(area=r.area, lat=r.lat, lon=r.lon, date=r.day.isoformat(), start=r.start, end=r.end, hours=r.hours_off, source=r.source)
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
    predict: object = None          # (points, feature matrix) -> hours a week

    def summary(self) -> dict:
        return dict(chosen=self.chosen, used=self.used, areas=self.n, loo_mae_hours_week={k: round(v, 2) for k, v in self.loo_mae.items()})


def choose_model(train: list[Area], alpha: float = 2.0) -> Model:
    """Leave-one-area-out error for the average, nearest areas (inverse distance) and a ridge regression on the place
    features; the best is used only with enough areas and when it beats the average by MUST_BEAT."""
    diary = [a for a in train if a.diary and a.features]
    n = len(diary)
    if n < 3:
        return Model("average", False, n, {})
    y = np.array([a.hours_week for a in diary])
    pts = [(a.lat, a.lon) for a in diary]
    X = np.array([[a.features[f] for f in FEATURES] for a in diary])
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
