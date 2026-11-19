"""Tests for scripts/everyday.py (everyday weather advice). Run: python -m pytest tests/ (or python tests/test_everyday.py)."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import everyday as E  # noqa: E402

TH = json.loads((ROOT / "docs" / "site-weather" / "thresholds.json").read_text())["everyday"]


def frame(**cols):
    """A calm, dry, mild day (00-23 h local) with the columns derive() writes; override any column by keyword."""
    idx = pd.date_range("2026-11-20", periods=24, freq="h", tz="Africa/Kampala")
    hour = idx.hour.to_numpy()
    sun = np.clip(np.sin((hour - 6.5) / 12 * np.pi), 0, None)
    base = dict(precipitation=0.0, precipitation_probability=5.0, thunder=0, wind_gusts_10m=4.0, wind_speed_10m=2.0,
                wbgt_sun=22.0, wbgt_shade=20.0, rain_prev3=0.0, rain_prev24=0.0, relative_humidity_2m=60.0,
                temperature_2m=25.0, shortwave_radiation=800 * sun, visibility=20000.0, uv_index=4.0, solar_elev=70 * sun)
    df = pd.DataFrame({k: np.full(24, v, dtype=float) if np.isscalar(v) else np.asarray(v, dtype=float)
                       for k, v in base.items()}, index=idx)
    for k, v in cols.items():
        df[k] = v(hour) if callable(v) else v
    return df


def rows(g, pm25=None):
    return {r["key"]: r for r in E.day(g, TH, pm25)["rows"]}


def test_calm_day_is_fine_for_everything_but_drying_after_dark():
    out = E.day(frame(), TH)
    r = {x["key"]: x for x in out["rows"]}
    for k in ("walking", "boda", "driving", "event", "goods", "sensitive", "exercise", "spraying", "fieldwork"):
        assert r[k]["status"] == "GO", (k, r[k])
    assert [h for h, _ in r["walking"]["hours"]] == list(range(TH["hours"][0], TH["hours"][1]))
    assert r["drying"]["status"] == "LIMITED" and "night" in r["drying"]["causes"]     # bring produce in at night
    assert out["headline"].startswith("A good day") or "check your plans" in out["headline"]


def test_afternoon_storm_stops_exposed_activities_from_its_hour():
    g = frame(thunder=lambda h: np.where(h >= 15, 2, 0), precipitation=lambda h: np.where(h >= 15, 6.0, 0.0),
              precipitation_probability=lambda h: np.where(h >= 14, 90.0, 10.0))
    out = E.day(g, TH)
    r = {x["key"]: x for x in out["rows"]}
    assert out["headline"].startswith("Storms likely 15:00 to 21:00")
    walk = dict(map(tuple, r["walking"]["hours"]))
    assert walk[10] == 0 and walk[15] == 2 and walk[14] == 1          # rain chance before the storm: with care
    assert r["walking"]["label"].startswith("Best 06-14 h")
    assert r["event"]["causes"][0] in ("storms", "rain")
    assert "first thunder" in r["walking"]["action"]
    assert dict(map(tuple, r["spraying"]["hours"]))[10] == 2          # rain within 6 h washes spray off


def test_heat_limits_are_stricter_for_children_and_older_people():
    g = frame(wbgt_sun=lambda h: np.where((h >= 12) & (h < 16), 29.5, 23.0))
    r = rows(g)
    walk, sens = dict(map(tuple, r["walking"]["hours"])), dict(map(tuple, r["sensitive"]["hours"]))
    assert walk[13] == 1 and sens[13] == 2
    assert "heat" in r["sensitive"]["causes"]
    assert E.day(g, TH)["headline"].startswith("Hot 12:00 to 16:00")


def test_downpour_and_wet_roads():
    g = frame(precipitation=lambda h: np.where(h == 9, 12.0, 0.0), rain_prev3=lambda h: np.where((h >= 10) & (h <= 12), 12.0, 0.0),
              rain_prev24=lambda h: np.where(h >= 10, 12.0, 0.0))
    r = rows(g)
    drive, boda = dict(map(tuple, r["driving"]["hours"])), dict(map(tuple, r["boda"]["hours"]))
    assert drive[9] == 2 and drive[8] == 0
    assert boda[11] == 1 and "wet roads" in r["boda"]["causes"]


def test_air_quality_and_extras():
    pm = pd.Series(np.where(np.arange(24) >= 17, 60.0, 10.0), index=frame().index)
    g = frame(uv_index=lambda h: np.where((h >= 11) & (h < 15), 11.0, 3.0))
    out = E.day(g, TH, pm)
    r = {x["key"]: x for x in out["rows"]}
    assert dict(map(tuple, r["exercise"]["hours"]))[18] == 2 and "air quality" in r["exercise"]["causes"]
    assert any(x.startswith("UV up to 11 (extreme) 11-15 h") for x in out["extras"])
    assert any("PM2.5" in x for x in out["extras"])


def test_windows():
    assert E.windows([0, 1, 1, 0, 1], [6, 7, 8, 9, 10]) == ["07-09 h", "10-11 h"]
    assert E.windows([1, 1, 1], [11, 12, 14]) == ["11-13 h", "14-15 h"]           # a gap in hours ends a run
    assert E.windows([], []) == []


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
