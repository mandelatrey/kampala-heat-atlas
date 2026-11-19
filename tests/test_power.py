"""Power-cut log, rates and the estimate model (src/kampala/power.py), on made-up data only."""
from datetime import date

import numpy as np
import pytest

from kampala import power as P

HEADER = "area,lat,lon,date,hours_off,cuts,kind,start,end,source,notes\n"


def write(tmp_path, body):
    f = tmp_path / "log.csv"
    f.write_text(HEADER + body, encoding="utf-8")
    return f


def test_reads_rows_and_matches_names_to_places(tmp_path):
    rows = P.read_log(write(tmp_path, "Alpha,,,2026-11-01,3,1,unplanned,,,diary,\nBeta,0.4,32.6,2026-11-01,0,,,,,diary,\n\n"))
    assert [r.area for r in rows] == ["Alpha", "Beta"] and rows[1].kind == "unknown"
    unknown = P.locate(rows, [{"name": "alpha", "rank": 5, "lat": 0.3, "lon": 32.5}, {"name": "Alpha", "rank": 3, "lat": 0.31, "lon": 32.51}])
    assert unknown == [] and (rows[0].lat, rows[0].lon) == (0.31, 32.51)        # biggest place of that name
    rows = P.read_log(write(tmp_path, "Gamma,,,2026-11-01,3,,,,,,\n"))
    assert P.locate(rows, []) == ["Gamma"]


@pytest.mark.parametrize("body, msg", [
    ("A,,,2026-13-01,3,,,,,,\n", "YYYY-MM-DD"),
    ("A,,,2026-11-01,30,,,,,,\n", "0 to 24"),
    ("A,,,2026-11-01,3,,sometimes,,,,\n", "kind"),
    (",,,2026-11-01,3,,,,,,\n", "no area"),
])
def test_says_which_line_is_wrong(tmp_path, body, msg):
    with pytest.raises(ValueError, match=msg):
        P.read_log(write(tmp_path, body))


def test_rates_need_zero_days_and_keep_the_longer_of_duplicate_days(tmp_path):
    rows = P.read_log(write(tmp_path, "".join([
        "A,0.3,32.5,2026-11-01,4,2,unplanned,,,diary,\n",
        "A,0.3,32.5,2026-11-01,6,2,unplanned,,,news,\n",      # same day, other source: keep 6
        "A,0.3,32.5,2026-11-02,0,0,,,,diary,\n",
        "B,0.4,32.6,2026-11-01,8,,planned,07:00,15:00,UEDCL notice,\n",
        "B,0.4,32.6,2026-12-20,11,,planned,07:00,18:00,UEDCL notice,\n",   # future: an upcoming cut, not a rate
    ])))
    a, b = P.areas(rows, date(2026, 11, 19))
    assert (a.days, a.zero_days, a.hours_week, a.cuts_week, a.diary) == (2, 1, 21.0, 7.0, True)
    assert a.sources == ["diary", "news"]
    assert (b.days, b.diary, b.hours_week) == (1, False, 56.0)
    assert [u["date"] for u in P.upcoming(rows, date(2026, 11, 19))] == ["2026-12-20"]


def test_features_from_classes():
    lc = np.array([[1, 2, 3, 7]]); growth = np.array([[1, 3, 0, 0]]); informal = np.array([[1, 0, 0, 0]])
    f = P.shares(lc, growth, informal)
    assert f == {"built": 0.5, "new_built": 0.5, "trees": 0.25, "informal": 0.25}


def _areas(hours, coords, feats=None):
    out = []
    for i, (h, (lat, lon)) in enumerate(zip(hours, coords)):
        f = feats[i] if feats else {k: 0.0 for k in P.FEATURES}
        out.append(P.Area(f"A{i}", lat, lon, 14, 7, h, None, {}, "", "", [], dict(f)))
    return out


def test_uses_nearest_areas_when_cuts_follow_geography():
    rng = np.random.default_rng(1)
    coords = [(0.25 + 0.03 * i, 32.50 + 0.02 * (i % 3)) for i in range(10)]
    hours = [2 + 30 * (lat - 0.25) / 0.27 + rng.normal(0, 0.5) for lat, _ in coords]   # north gets more cuts
    m = P.choose_model(_areas(hours, coords))
    assert m.used and m.chosen == "nearest areas"
    assert m.loo_mae["nearest areas"] < 0.9 * m.loo_mae["average"]
    est = m.predict([(0.25, 32.5), (0.52, 32.5)], None)
    assert est[0] < est[1]


def test_uses_area_features_when_cuts_follow_them():
    rng = np.random.default_rng(2)
    coords = [(0.2 + 0.4 * rng.random(), 32.4 + 0.4 * rng.random()) for _ in range(12)]
    feats = [{"built": rng.random(), "new_built": rng.random(), "trees": rng.random(), "informal": rng.random(), "dist_cbd_km": 20 * rng.random()} for _ in range(12)]
    hours = [3 + 25 * f["new_built"] + rng.normal(0, 0.3) for f in feats]              # new building -> more cuts
    m = P.choose_model(_areas(hours, coords, feats))
    assert m.used and m.chosen == "area features"


def test_declines_when_nothing_beats_the_average():
    rng = np.random.default_rng(3)
    coords = [(0.2 + 0.4 * rng.random(), 32.4 + 0.4 * rng.random()) for _ in range(10)]
    m = P.choose_model(_areas(list(10 + rng.normal(0, 4, 10)), coords))
    assert not m.used and m.chosen == "average" and m.predict is None


def test_declines_with_too_few_areas():
    coords = [(0.25 + 0.05 * i, 32.5) for i in range(4)]
    m = P.choose_model(_areas([1, 5, 9, 13], coords))
    assert not m.used and m.n == 4
