"""Write the data for the 'Kampala Heat Atlas' page (the page itself is the React app in web/).

    python scripts/14_atlas.py <output_dir>          # scripts/17_build_site.py passes docs/

Writes <output_dir>/atlas/:
  atlas.json        grid size and georeference, years, and the layer list: each layer's file, how its stored
                    integers become values, and the colours the page draws it with (contract: web/src/atlas/types.ts)
  base.jpg          FABDEM hillshade (an optional relief shading under the layers)
  layers/<id>.tif   every map layer as data: a Cloud-Optimized GeoTIFF on the shared 30 m grid (UTM 36N), with
                    scale, nodata and units set, so the page can colour it, read values under the cursor, and
                    anyone can open the same file in QGIS

Numbers and charts come from the result tables: scripts/14c_atlas_stats.py writes stats.json next to these.
"""
import io
import json
import shutil
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from PIL import Image

from kampala import config
from kampala import viz as V
from kampala.config import DATA
from kampala.weblayers import class_layer, ramp_layer

OUT = Path(sys.argv[1]) / "atlas"
# generated parts only: start them clean (no stale layers); stats.json and tables/ belong to 14c_atlas_stats.py
for d in ("layers", "charts", "anims"):
    shutil.rmtree(OUT / d, ignore_errors=True)
(OUT / "layers").mkdir(parents=True, exist_ok=True)
P = DATA / "processed"
EP = config.load()["epochs"]; Y = [s["year"] for s in EP.values()]

with rasterio.open(P / "m0" / "terrain_fabdem_30m.tif") as r:
    H, W, T, CRS = r.height, r.width, r.transform, r.crs
    hs = r.read(4).astype(float)
LAYERS = OUT / "layers"


def fit(a):
    """Crop / pad any array to the master grid shape."""
    out = np.zeros((H, W), dtype=a.dtype)
    h, w = min(H, a.shape[0]), min(W, a.shape[1])
    out[:h, :w] = a[:h, :w]
    return out


def save(rel, im, fmt, **kw):
    """Write an image under OUT and return its path relative to OUT, as listed in atlas.json."""
    buf = io.BytesIO(); im.save(buf, fmt, **kw)
    (OUT / rel).write_bytes(buf.getvalue())
    return rel


def rd(path, band=1, step=1):
    with rasterio.open(path) as r:
        return r.read(band)[::step, ::step]


def classes(name, a, colors, names):
    return class_layer(LAYERS, name, fit(a), colors, names, CRS, T)


def ramp(name, a, **kw):
    return ramp_layer(LAYERS, name, fit(a), crs=CRS, transform=T, **kw)


DIVERGING = V.BLUE[::-1][:6] + [V.NEUTRAL] + V.REDS[1:]        # the stops of V.DIVERGING

g = np.clip((hs - np.nanpercentile(hs, 2)) / (np.nanpercentile(hs, 98) - np.nanpercentile(hs, 2)), 0, 1)
_im = Image.fromarray((np.dstack([0.55 + 0.4 * g] * 3) * 255).astype("uint8"), "RGB")
_im = _im.resize((1100, round(_im.height * 1100 / _im.width)), Image.LANCZOS)
BASE = save("base.jpg", _im, "JPEG", quality=78)

THERMAL = dict(colors=list(V.THERMAL.colors), names=V.THERMAL_NAMES)
layers = []                                                    # in panel order


def add(id_, group, label, caption, data):
    layers.append(dict(id=id_, group=group, label=label, caption=caption, **data))


# ---- heat
a1 = fit(rd(P / "m2" / f"lst_landsat_t1_{Y[0]}_30m.tif", 2)); a3 = fit(rd(P / "m2" / f"lst_landsat_t3_{Y[2]}_30m.tif", 2))
lc25 = fit(rd(P / "m1" / f"landcover_t3_{Y[2]}_10m.tif", 1, 3))
water = lc25 == 7                                              # the anomaly is against the city LAND mean
add("lst-2025", "Heat", f"Surface heat {Y[2]}",
    "Land surface temperature minus the city land mean (dry-season median over three years). Gap-free: computed from the "
    "thermal band with NDVI-based emissivity and calibrated to the Collection 2 product. This is the temperature of the "
    "ground and roofs, which runs well above the air temperature people feel.",
    ramp("lst-2025", a3, mask=water, step=0.05, unit="°C", colors=DIVERGING, vmin=-8, vmax=8,
         labels=["8 °C cooler", "city average", "8 °C hotter"], readout="{v} °C vs the city average", decimals=1, signed=True))
add("lst-change", "Heat", f"Heat change {Y[0]}–{Y[2]}",
    "Change in surface heat relative to the city, between the two maps. Read local contrasts; broad regional bands in the "
    "west may include compositing differences.",
    ramp("lst-change", a3 - a1, mask=water, step=0.05, unit="°C", colors=DIVERGING, vmin=-4, vmax=4,
         labels=["cooled 4 °C", "no change", "warmed 4 °C"], readout="{v} °C since " + str(Y[0]), decimals=1, signed=True))
for i, (ep, s) in enumerate(reversed(list(EP.items()))):
    add(f"thermal-{s['year']}", "Heat", f"Thermal classes {s['year']}",
        "Surface heat classed by distance from the city land mean (±0.5 and ±1.5 standard deviations)." if i == 0
        else f"Same method, {s['year']} window.",
        classes(f"thermal-{s['year']}", rd(P / "m2" / f"thermal_classes_{ep}_{s['year']}_30m.tif"), **THERMAL))
add("hot-persistence", "Heat", "Persistent hot spots",
    f"How many of the three epochs ({', '.join(map(str, Y))}) each 30 m cell was in the hottest class.",
    classes("hot-persistence", rd(P / "m2" / "hot_persistence_count_30m.tif"), [V.REDS[1], V.REDS[3], V.REDS[6]],
            ["hot in 1 epoch", "hot in 2 epochs", "hot in all 3"]))

# ---- growth
LC = dict(colors=V.LANDCOVER, names=V.LC_NAMES)
add("landcover-2025", "Growth", f"Land cover {Y[2]}",
    "Sentinel-2 random forest, 10 m, trained on Dynamic World labels; built-up requires building evidence within about 30 m.",
    classes("landcover-2025", lc25, **LC))
add("landcover-2017", "Growth", f"Land cover {Y[0]}", f"Same method, {Y[0]} (Sentinel-2 L1C).",
    classes("landcover-2017", rd(P / "m1" / f"landcover_t1_{Y[0]}_10m.tif", 1, 3), **LC))
add("growth", "Growth", "Where the city grew", "First epoch in which each 10 m pixel is mapped as built-up.",
    classes("growth", rd(P / "m1" / "growth_frontier_10m.tif", 1, 3), ["#a9a8a0", V.ORANGES[3], V.REDS[5]],
            [f"built by {Y[0]}", f"new {Y[0]}–{Y[1]}", f"new {Y[1]}–{Y[2]}"]))

# ---- people
inf = np.kron(rd(P / "m3" / f"settlement_groups_t3_{Y[2]}_90m.tif"), np.ones((3, 3), dtype="uint8"))
add("informal-2025", "People", "Informal-type settlement",
    "90 m cells with ≥35 % roof cover, mean footprint ≤80 m², ≥30 buildings/ha, low roofs, in clusters ≥2.4 ha. "
    "A morphology proxy that misses mixed-use areas such as Kisenyi.",
    classes("informal-2025", (inf == 1), ["#1b1b1f"], ["informal-type morphology"]))

# ---- response
add("trees", "Response", "Tree-planting priority",
    "Heat rank × population rank (×1.5 in informal-type areas) × canopy deficit, only where open grass, cropland or bare "
    "land exists on slopes under 30°. Wetlands are never plantable.",
    classes("trees", rd(P / "m4" / "tree_priority_classes_30m.tif"), [V.GREENS[1], V.GREENS[2], V.GREENS[4], V.GREENS[6]],
            ["low", "medium", "high", "very high"]))

# rooftop solar density: GWh per km2 on 240 m blocks of the master grid
sol = pd.read_parquet(P / "m5" / "rooftop_solar_buildings.parquet")
b = gpd.read_parquet(DATA / "raw" / "overture_buildings.parquet", columns=["geometry"]).to_crs(config.load()["study_area"]["crs"])
c = b.geometry.centroid.loc[sol.index]
rows, cols = rasterio.transform.rowcol(T, c.x.values, c.y.values)
rows, cols = np.asarray(rows), np.asarray(cols)
ok = (rows >= 0) & (rows < H) & (cols >= 0) & (cols < W)
grid = np.zeros((H, W)); np.add.at(grid, (rows[ok], cols[ok]), sol["kwh_yr"].values[ok])
k = 8
hb, wb = H // k, W // k
blk = grid[:hb * k, :wb * k].reshape(hb, k, wb, k).sum(axis=(1, 3)) / 1e6 / ((k * 30) ** 2 / 1e6)
solar_max = float(np.percentile(blk[blk > 0], 99))
add("solar", "Response", "Rooftop solar potential",
    f"{len(sol) / 1e6:.1f} million Overture roofs, ERA5-Land irradiance 2015–2024, 21 % modules, 0.80 performance ratio, "
    "shading from neighbouring building heights; summed over 240 m blocks.",
    ramp("solar", np.kron(blk, np.ones((k, k))), step=0.01, unit="GWh/km²/yr", colors=V.ORANGES, vmin=0,
         vmax=round(solar_max), labels=["0", "GWh per km² a year", f"{solar_max:.0f}"],
         readout="{v} GWh per km² a year from rooftops", decimals=1, hide_below=0.5))

for _f in sorted(OUT.glob("layers/*")) + [OUT / BASE]:
    print(f"  {_f.relative_to(OUT)!s:30s} {_f.stat().st_size / 1e6:.2f} MB")

manifest = dict(
    size=[H, W], years=Y, base=BASE,
    # where the grid sits: pixel (row r, col c) has its top-left corner at x = origin[0] + c * pixel,
    # y = origin[1] - r * pixel in crs; the page uses it to place the layers on the map and read values
    grid=dict(crs=config.load()["study_area"]["crs"], origin=[round(T.c, 3), round(T.f, 3)], pixel=round(T.a, 6)),
    layers=layers,
)
(OUT / "atlas.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {OUT} ({sum(f.stat().st_size for f in OUT.rglob('*.*')) / 1e6:.1f} MB)")
