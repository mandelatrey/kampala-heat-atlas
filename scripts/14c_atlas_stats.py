"""Numbers and chart data for the atlas page, from the result tables. Needs no rasters, so it runs anywhere.

    python scripts/14c_atlas_stats.py [docs_dir]      # default docs/; scripts/17_build_site.py runs it after 14_atlas.py

Reads outputs/tables/ (committed) and writes:
  <docs>/atlas/stats.json     every number the page quotes, as raw values (the page rounds and formats them),
                              and the series behind each chart, with colours from kampala.viz
  <docs>/atlas/tables/*.csv   copies of the tables those come from; each chart links to its table

On the author's machine it first refreshes two small tables from the data folder, when the inputs are there:
  m0_wind_diurnal.csv          wind direction frequency by hour (16 sectors) and mean speed, ERA5-Land hourly
  m2_hot_persistence_km2.csv   area in the hottest class in 0, 1, 2 or 3 of the epochs
Anything that needs a missing table is left out of stats.json, and the page leaves that sentence or chart out.

The contract with the page is web/src/atlas/stats.ts: change both together.
"""
import datetime as dt
import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from kampala import config
from kampala import viz as V
from kampala.config import DATA, OUTPUTS

DOCS = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "docs"
OUT = DOCS / "atlas"
TAB = OUTPUTS / "tables"
CFG = config.load()
Y = [s["year"] for s in CFG["epochs"].values()]
SECTORS = 16


# ---------------------------------------------------------------- small tables refreshed from the data folder
def refresh_wind():
    src = DATA / "interim" / "m0_era5land_wind_kampala.csv"
    if not src.exists():
        return
    w = pd.read_csv(src)
    hour = pd.to_datetime(w["time"], utc=True).dt.tz_convert("Africa/Kampala").dt.hour
    sector = (((w["dir_from"] + 360 / SECTORS / 2) % 360) // (360 / SECTORS)).astype(int)
    freq = pd.crosstab(hour, sector, normalize="index").reindex(columns=range(SECTORS), fill_value=0)
    freq.columns = [f"from_{int(c * 360 / SECTORS):03d}" for c in freq.columns]
    out = freq.assign(mean_speed_ms=w.groupby(hour)["speed"].mean(), hours=hour.value_counts().sort_index())
    out.index.name = "hour_local"
    out.to_csv(TAB / "m0_wind_diurnal.csv", float_format="%.5f")
    print(f"refreshed m0_wind_diurnal.csv from {src.name}")


def refresh_persistence():
    src = DATA / "processed" / "m2" / "hot_persistence_count_30m.tif"
    if not src.exists():
        return
    import rasterio
    with rasterio.open(src) as r:
        a = r.read(1)
        cell_km2 = abs(r.transform.a * r.transform.e) / 1e6
    rows = [dict(epochs_hot=k, km2=float((a == k).sum() * cell_km2)) for k in range(4)]
    pd.DataFrame(rows).to_csv(TAB / "m2_hot_persistence_km2.csv", index=False)
    print(f"refreshed m2_hot_persistence_km2.csv from {src.name}")


refresh_wind()
refresh_persistence()

# ---------------------------------------------------------------- read
used: set[str] = set()


def csv(name, **kw):
    used.add(name)
    return pd.read_csv(TAB / name, **kw)


def has(name):
    return (TAB / name).exists()


def rng(s):
    """[min, max] of a series, as plain floats."""
    return [float(np.min(s)), float(np.max(s))]


def lcz_name(code):
    """'3 compact low-rise' -> 'compact low-rise'"""
    return re.sub(r"^\w+\s+", "", code)


area = csv("m1_class_area.csv", index_col=0)
trans = csv("m1_transitions_2017_2025_km2.csv", index_col=0)
diag = [json.loads((TAB / f"m1_{e}_diagnostics.json").read_text()) for e in CFG["epochs"]]
used.update(f"m1_{e}_diagnostics.json" for e in CFG["epochs"])
thermal = csv("m2_thermal_class_area.csv")
lcz = csv("m2_lst_by_lcz.csv")
cal = csv("m2_lst_calibration.csv")
groups = csv("m3_lst_by_settlement_group.csv")
traj = csv("m3_thermal_trajectories.csv", index_col=0)
sdi = csv("m3_sdi_sensitivity.csv")
pri = csv("m4_priority_summary.csv").set_index("priority")
plant = csv("m4_planting_scenario.csv", index_col=0)["value"]
solar = csv("m5_solar_totals.csv", index_col=0)["value"]
scen = csv("m5_solar_scenarios.csv")
demand = csv("m5_solar_vs_demand.csv").set_index("benchmark")
tilt = csv("m0_clear_sky_tilt_azimuth.csv")
facade = csv("m0_facade_direct_beam.csv", index_col=0)["direct_kwh_m2_yr"]
kml = TAB / "m1_validation_points_2025.kml"
used.add(kml.name)

# ---------------------------------------------------------------- numbers
built = area.loc[["built_dense", "built_sparse"]].sum()
hot = thermal[thermal.name == "hot"].set_index("year")["km2"]
g25 = groups[groups.year == Y[2]].set_index("group")["LST_anom_mean"]
lczp = lcz.pivot(index="lcz", columns="year", values="LST_anom_mean")
BUILT_LCZ = [z for z in lczp.index if z[0].isdigit()]
hottest = lczp.loc[BUILT_LCZ, Y[2]].sort_values(ascending=False)
warming = (lczp[Y[2]] - lczp[Y[0]]).loc[BUILT_LCZ].sort_values(ascending=False)
dense_trees = next(z for z in lczp.index if z.startswith("A "))
flat = tilt[tilt.tilt == 0].kwh_m2_yr.mean()
low_tilt = tilt[tilt.tilt.between(1, 10)].kwh_m2_yr
umeme = next(b for b in demand.index if "Umeme" in b)
lat = CFG["study_area"]["centre"]["lat"]

numbers = dict(
    built_km2=[float(v) for v in built],
    sparse_to_dense_km2=float(trans.loc["built_sparse", "built_dense"]),
    label_agreement=rng([d["label_agreement"] for d in diag]),
    kappa=rng([d["kappa"] for d in diag]),
    validation_points=len(re.findall(r"<Placemark\b", kml.read_text(encoding="utf-8"))),
    hot_km2=[float(hot.loc[y]) for y in Y],
    lst_r=rng(cal.r_vs_C2ST),
    c2st_coverage=rng(cal.C2ST_coverage),
    hottest_lcz=[lcz_name(z) for z in hottest.index[:2]],
    fastest_warming_lcz=lcz_name(warming.index[0]),
    fastest_warming_lcz_change=float(warming.iloc[0]),
    dense_trees_anom=float(lczp.loc[dense_trees, Y[2]]),
    informal_anom=float(g25["informal-type"]),
    formal_dense_anom=float(g25["formal dense"]),
    became_informal_change=float(traj.loc["became informal-type", "change_2017_2025"]),
    always_formal_change=float(traj.loc["always formal dense", "change_2017_2025"]),
    sdi_anom=rng(sdi.sdi_anom_2025), sdi_dense_anom=rng(sdi.dense_anom_2025),
    sdi_change=rng(sdi.sdi_change), sdi_dense_change=rng(sdi.dense_change),
    sdi_detected_share=rng(sdi.ref_flagged_informal),
    cooling_per_10pct_canopy=float(plant["cooling_per_10pct_canopy_C"]),
    planting_cooling=float(plant["mean_cooling_C"]),
    planting_new_canopy_km2=float(plant["new_canopy_km2"]),
    planting_people=float(plant["people_in_planted_cells"]),
    cooling_model_r2=float(plant["model_R2"]),
    very_high_km2=float(pri.loc["very high", "km2"]),
    very_high_people=float(pri.loc["very high", "people"]),
    very_high_tree_pct=float(pri.loc["very high", "current_tree_pct"]),
    roofs=float(solar["buildings"]),
    solar_gwp=float(solar["capacity_GWp"]),
    solar_gwh=float(solar["generation_GWh_yr"]),
    solar_yield=float(solar["specific_yield_kWh_per_kWp"]),
    solar_top10_gwh=float(scen.loc[scen.adoption.str.startswith("10%"), "largest_first_GWh"].iloc[0]),
    national_sales_gwh=float(demand.loc[umeme, "demand_GWh"]),
    noon_sun_min_deg=90 - abs(lat) - 23.44,
    centre_lat=lat,
    low_tilt_max_loss_pct=float(100 * (1 - low_tilt.min() / flat)),
    east_west_wall_ratio=float((facade["east"] + facade["west"]) / (facade["north"] + facade["south"])),
)
if has("m2_hot_persistence_km2.csv"):
    hp = csv("m2_hot_persistence_km2.csv").set_index("epochs_hot")["km2"]
    numbers["hot_all_epochs_km2"] = float(hp.loc[len(Y)])

# ---------------------------------------------------------------- charts
GREENS = [V.GREENS[1], V.GREENS[2], V.GREENS[4], V.GREENS[6]]          # as the tree-priority map layer
charts = dict(
    landcover=dict(source="m1_class_area.csv", years=Y, classes=[
        dict(name=V.LC_NAMES[i], color=V.LANDCOVER[i], km2=[float(v) for v in row.values])
        for i, (_, row) in enumerate(area.iterrows())]),
    lcz=dict(source="m2_lst_by_lcz.csv", years=[Y[0], Y[2]], series_colors=V.SERIES[:2], zones=[
        dict(name=z, values=[float(lczp.loc[z, Y[0]]), float(lczp.loc[z, Y[2]])])
        for z in lczp.sort_values(Y[2]).index]),
    trajectories=dict(source="m3_thermal_trajectories.csv", years=Y, series=[
        dict(name=name, color=V.SERIES[i], values=[float(row[str(y)]) for y in Y], km2=float(row["km2"]))
        for i, (name, row) in enumerate(traj.iterrows())]),
    solar=dict(source="m5_solar_scenarios.csv", series_colors=[V.SERIES[1], V.SERIES[0]], scenarios=[
        dict(adoption=r.adoption, largest_first_gwh=float(r.largest_first_GWh), random_gwh=float(r.random_GWh))
        for r in scen.itertuples()], benchmark=dict(label="national sales 2024 (Umeme)", gwh=numbers["national_sales_gwh"])),
    trees=dict(source="m4_priority_summary.csv", classes=[
        dict(name=p, color=GREENS[i], people=float(r.people), plantable_km2=float(r.plantable_km2), km2=float(r.km2))
        for i, (p, r) in enumerate(pri.iterrows())]),
)
if has("m0_wind_diurnal.csv"):
    w = csv("m0_wind_diurnal.csv", index_col=0)
    cols = [c for c in w.columns if c.startswith("from_")]
    charts["wind"] = dict(
        source="m0_wind_diurnal.csv", source_note="ERA5-Land hourly wind, 2015–2024", day_color=V.SERIES[0], night_color=V.SERIES[6],
        sectors=[int(c[5:]) for c in cols],
        hours=[dict(hour=int(h), speed=float(r.mean_speed_ms), freq=[float(r[c]) for c in cols]) for h, r in w.iterrows()])
    # the lake breeze: share of hours with wind from SE, SSE or S, by hour of day
    se = w[[c for c in cols if 112.5 < int(c[5:]) <= 180]].sum(axis=1)
    numbers["lake_breeze_peak_hour"] = int(se.idxmax())
    numbers["lake_breeze_peak_share"] = float(se.max())

# ---------------------------------------------------------------- write
(OUT / "tables").mkdir(parents=True, exist_ok=True)
for old in (OUT / "tables").glob("*"):
    old.unlink()
for name in sorted(used):
    if not name.endswith(".kml"):                    # the validation points stay private until labelled
        shutil.copy2(TAB / name, OUT / "tables" / name)
stats = dict(generated=f"{dt.date.today():%Y-%m-%d}", years=Y, numbers=numbers, charts=charts,
             tables={n: f"tables/{n}" for n in sorted(used) if not n.endswith(".kml")})
(OUT / "stats.json").write_text(json.dumps(stats, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {OUT / 'stats.json'} ({len(numbers)} numbers, {len(charts)} charts, {len(stats['tables'])} tables)")
