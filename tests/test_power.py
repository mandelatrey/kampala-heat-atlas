"""Power-cut log, sampling periods, rates and the estimate model (src/kampala/power.py), on made-up data only."""
from datetime import date

import numpy as np
import pytest

from kampala import power as P

LOG = "area,lat,lon,date,hours_off,cuts,kind,start,end,source,notes\n"
SAMPLING = "area,lat,lon,from,to,source\n"
TODAY = date(2026, 11, 19)


def write(tmp_path, name, header, body):
    f = tmp_path / name
    f.write_text(header + body, encoding="utf-8")
    return f


def log(tmp_path, body):
    return P.read_log(write(tmp_path, "log.csv", LOG, body))


def sampling(tmp_path, body):
    return P.read_sampling(write(tmp_path, "sampling.csv", SAMPLING, body))


def test_reads_rows_with_or_without_hours_and_matches_names(tmp_path):
    rows = log(tmp_path, "Alpha,,,2026-11-01,,,unplanned,,,X complaint to UEDCL,\nBeta,0.4,32.6,2026-11-01,3,,,,,diary,\n\n")
    assert [r.hours_off for r in rows] == [None, 3.0] and rows[1].kind == "unknown"
    unknown = P.locate(rows, [{"name": "alpha", "rank": 5, "lat": 0.3, "lon": 32.5}, {"name": "Alpha", "rank": 3, "lat": 0.31, "lon": 32.51}])
    assert unknown == [] and (rows[0].lat, rows[0].lon) == (0.31, 32.51)        # biggest place of that name
    assert P.locate(log(tmp_path, "Gamma,,,2026-11-01,,,,,,,\n"), []) == ["Gamma"]


@pytest.mark.parametrize("body, msg", [
    ("A,,,2026-13-01,3,,,,,,\n", "YYYY-MM-DD"),
    ("A,,,2026-11-01,30,,,,,,\n", "0 to 24"),
    ("A,,,2026-11-01,3,,sometimes,,,,\n", "kind"),
    (",,,2026-11-01,3,,,,,,\n", "no area"),
])
def test_says_which_log_line_is_wrong(tmp_path, body, msg):
    with pytest.raises(ValueError, match=msg):
        log(tmp_path, body)


def test_says_which_sampling_line_is_wrong(tmp_path):
    with pytest.raises(ValueError, match="before"):
        sampling(tmp_path, "*,,,2026-11-10,2026-11-01,\n")


def test_unreported_days_in_a_sampling_period_count_as_power_on(tmp_path):
    rows = log(tmp_path, "".join([
        "A,0.3,32.5,2026-11-02,,,unplanned,,,X complaint to UEDCL,\n",
        "A,0.3,32.5,2026-11-02,,,unplanned,,,X complaint to UEDCL,\n",    # same day twice: one cut day
        "A,0.3,32.5,2026-11-05,,,unplanned,,,X complaint to UEDCL,\n",
        "A,0.3,32.5,2026-11-20,,,unplanned,,,X complaint to UEDCL,\n",    # outside the period
        "B,0.4,32.6,2026-11-03,,,unplanned,,,X complaint to UEDCL,\n",    # reports, no period of its own
    ]))
    windows = sampling(tmp_path, "A,0.3,32.5,2026-11-01,2026-11-14,X complaints\n")
    a, b = P.areas(rows, windows, TODAY)
    assert (a.basis, a.days, a.cut_days, a.cut_days_week, a.hours_week) == ("sampled", 14, 2, 1.0, None)
    assert (b.basis, b.days, b.cut_days) == ("reports only", 1, 1)


def test_a_watched_area_with_no_reports_counts_as_no_cuts_and_star_covers_the_rest(tmp_path):
    rows = log(tmp_path, "A,0.3,32.5,2026-11-02,4,,unplanned,,,diary,\nA,0.3,32.5,2026-11-03,2,,unplanned,,,diary,\n")
    windows = sampling(tmp_path, "*,,,2026-11-01,2026-11-07,\nQuiet,0.35,32.55,2026-11-01,2026-11-07,X complaints\n")
    a, q = P.areas(rows, windows, TODAY)
    assert (a.basis, a.days, a.cut_days, a.hours_week) == ("sampled", 7, 2, 6.0)    # every cut day has hours
    assert (q.name, q.basis, q.cut_days, q.cut_days_week) == ("Quiet", "sampled", 0, 0.0)


def test_periods_stop_at_today(tmp_path):
    windows = sampling(tmp_path, "Q,0.3,32.5,2026-11-15,2026-12-31,\n")
    assert P.areas([], windows, TODAY)[0].days == 5


def test_never_publishes_links_or_handles(tmp_path):
    for bad in ["https://x.com/someone/status/1", "@someone", "x.com/someone", "call +256 700 123456", "www.example.org"]:
        assert P.public_source(bad) is None, bad
    for ok in ["X complaint to UEDCL", "UEDCL notice 2026-11-05", "resident diary"]:
        assert P.public_source(ok) == ok
    rows = log(tmp_path, "A,0.3,32.5,2026-11-02,,,,,,https://x.com/someone/status/1,\nA,0.3,32.5,2026-11-03,,,,,,X complaint to UEDCL,\n")
    assert P.areas(rows, sampling(tmp_path, "A,0.3,32.5,2026-11-01,2026-11-07,\n"), TODAY)[0].sources == ["X complaint to UEDCL"]


def test_planned_cuts_and_typical_cut_length(tmp_path):
    rows = log(tmp_path, "B,0.4,32.6,2026-12-20,11,,planned,07:00,18:00,UEDCL notice,\nB,0.4,32.6,2026-11-01,8,,planned,07:00,15:00,UEDCL notice,\nC,0.4,32.6,2026-11-01,,,,,,,\n")
    assert [u["date"] for u in P.upcoming(rows, TODAY)] == ["2026-12-20"]
    assert P.hours_per_cut_day(rows) == 9.5


def test_features_from_classes():
    lc = np.array([[1, 2, 3, 7]]); growth = np.array([[1, 3, 0, 0]]); informal = np.array([[1, 0, 0, 0]])
    assert P.shares(lc, growth, informal) == {"built": 0.5, "new_built": 0.5, "trees": 0.25, "informal": 0.25}


def _areas(days_week, coords, feats=None, basis="sampled", days=14):
    out = []
    for i, (d, (lat, lon)) in enumerate(zip(days_week, coords)):
        f = feats[i] if feats else {k: 0.0 for k in P.FEATURES}
        out.append(P.Area(f"A{i}", lat, lon, basis, "", "", days, round(d * days / 7), d, None, {}, [], dict(f)))
    return out


def test_uses_nearest_areas_when_cuts_follow_geography():
    rng = np.random.default_rng(1)
    coords = [(0.25 + 0.03 * i, 32.50 + 0.02 * (i % 3)) for i in range(10)]
    y = [0.3 + 5.5 * (lat - 0.25) / 0.27 + rng.normal(0, 0.15) for lat, _ in coords]   # north: cuts most days
    m = P.choose_model(_areas(y, coords))
    assert m.used and m.chosen == "nearest areas" and m.loo_mae["nearest areas"] < 0.9 * m.loo_mae["average"]
    est = m.predict([(0.25, 32.5), (0.52, 32.5)], None)
    assert est[0] < est[1]


def test_learns_from_outlier_areas_when_cuts_follow_area_features():
    rng = np.random.default_rng(2)
    coords = [(0.2 + 0.4 * rng.random(), 32.4 + 0.4 * rng.random()) for _ in range(12)]
    feats = [{"built": rng.random(), "new_built": rng.random(), "trees": rng.random(), "informal": rng.random(), "dist_cbd_km": 20 * rng.random()} for _ in range(12)]
    y = [min(7.0, 0.5 + 5 * f["new_built"] ** 2 + rng.normal(0, 0.1)) for f in feats]   # a few areas with cuts most days
    m = P.choose_model(_areas(y, coords, feats))
    assert m.used and m.chosen == "area features"


def test_declines_when_nothing_beats_the_average():
    rng = np.random.default_rng(3)
    coords = [(0.2 + 0.4 * rng.random(), 32.4 + 0.4 * rng.random()) for _ in range(10)]
    m = P.choose_model(_areas(list(np.clip(2 + rng.normal(0, 1, 10), 0, 7)), coords))
    assert not m.used and m.chosen == "average" and m.predict is None


def test_leaves_out_unsampled_and_short_areas():
    coords = [(0.25 + 0.03 * i, 32.5) for i in range(10)]
    y = [0.5 * i for i in range(10)]
    assert P.choose_model(_areas(y, coords, basis="reports only")).n == 0
    assert P.choose_model(_areas(y, coords, days=5)).n == 0


def test_complaint_times_and_published_figures(tmp_path):
    header = "area,lat,lon,date,hours_off,cuts,kind,start,end,reported,source,notes\n"
    rows = P.read_log(write(tmp_path, "log2.csv", header, "A,0.3,32.5,2026-11-01,,,,,,20:15,X complaint,\nA,0.3,32.5,2026-11-02,0,,,,,09:00,X complaint,power was on\nA,0.3,32.5,2026-11-03,,,,,,07:05,,\n"))
    h = P.reported_hours(rows)
    assert (h[20], h[7], h[9], sum(h)) == (1, 1, 0, 2)          # a power-on day is not a cut
    with pytest.raises(ValueError, match="HH:MM"):
        P.read_log(write(tmp_path, "log3.csv", header, "A,0.3,32.5,2026-11-01,,,,,,8pm,,\n"))
    pub = write(tmp_path, "published.csv", "areas,lat,lon,from,to,cuts_per_month,qualifier,source,url,note\n",
                "Nowhere;Alpha,,,2019-08-01,2019-10-31,13,up to,A newspaper,https://example.org,\n")
    (p,) = P.read_published(pub, [{"name": "Alpha", "rank": 4, "lat": 0.38, "lon": 32.62}])
    assert (p["areas"], p["lat"], p["cuts_per_month"], p["qualifier"]) == (["Nowhere", "Alpha"], 0.38, 13.0, "up to")
