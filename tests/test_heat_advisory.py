"""Tests for scripts/heat_advisory.py. Run: python -m pytest tests/ (or python tests/test_heat_advisory.py)."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import heat_advisory as H  # noqa: E402

TH = json.loads((ROOT / "docs" / "site-weather" / "thresholds.json").read_text())["heat_advisory"]


def frame(wbgt):
    idx = pd.date_range("2026-11-20", periods=24, freq="h", tz="Africa/Kampala")
    hour = idx.hour.to_numpy()
    return pd.DataFrame({"wbgt_sun": wbgt(hour) if callable(wbgt) else np.full(24, float(wbgt))}, index=idx)


def test_levels_follow_the_bounds():
    assert list(H.level_of([20, 25, 27.9, 28, 30, 31.9, 32, 35], TH["wbgt_from_C"])) == [0, 1, 1, 2, 3, 3, 4, 4]


def test_low_day():
    out = H.day(frame(22), TH)
    assert out["level"] == 0 and out["name"] == "Low" and out["window"] == ""
    assert out["headline"].startswith("Low heat stress today")
    assert [a["key"] for a in out["advice"]] == ["workers", "vendors", "children", "elderly"]


def test_high_afternoon():
    out = H.day(frame(lambda h: np.where((h >= 12) & (h < 15), 29.0, np.where((h >= 10) & (h < 17), 26.0, 22.0))), TH)
    assert out["level"] == 2 and out["name"] == "High"
    assert out["window"] == "12-15 h" and out["risk_hours"] == "10-17 h"
    assert out["headline"].startswith("High heat 12:00 to 15:00")
    assert out["peak_hour"] == 12 and out["peak_wbgt"] == 29.0
    assert dict(map(tuple, out["hours"]))[13] == 2 and dict(map(tuple, out["hours"]))[11] == 1
    assert "15-minute shade break" in out["advice"][0]["text"]
    assert [h for h, _ in out["hours"]] == list(range(TH["hours"][0], TH["hours"][1]))


def test_extreme():
    out = H.day(frame(lambda h: np.where(h == 13, 33.0, 24.0)), TH)
    assert out["level"] == 4 and out["headline"].startswith("Extreme heat 13:00 to 14:00")


def test_two_stretches_read_as_one_span():
    out = H.day(frame(lambda h: np.where((h == 11) | ((h >= 14) & (h < 17)), 26.0, 23.0)), TH)
    assert out["window"] == "11-12 h, 14-17 h"
    assert out["headline"].startswith("Moderate heat 11:00 to 17:00")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
