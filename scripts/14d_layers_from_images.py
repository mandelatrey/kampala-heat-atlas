"""Atlas map layers as data, read back from the published layer images, for when the analysis rasters are not on
this machine (scripts/14_atlas.py needs them: they come from scripts 01-13 and live outside git).

    python scripts/14d_layers_from_images.py [docs_dir]      # default docs/

Reads docs/atlas/layers/<id>.png, the coloured images an earlier 14_atlas.py published, and turns each pixel's colour
back into the value it was drawn from, using the same palettes (kampala.viz) and the same colour arithmetic:
  categorical layers   exact: each colour is one class
  continuous layers    to the nearest colour step: 1/256 of the legend range (surface heat ±0.03 °C); values beyond
                       the ends of the legend were drawn in the end colour, so they read as the end value
The images are 1100 px wide, so the data have about 51 m cells instead of the analysis's 30 m.

Writes docs/atlas/layers/<id>.tif (same encoding as 14_atlas.py, via kampala.weblayers) and a new docs/atlas/atlas.json
that points at them; every caption says the values were read back from the image. The images stay where they are
(they are this script's input). Run 14_atlas.py instead whenever the rasters are available.
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from matplotlib.colors import to_rgba
from rasterio.transform import from_origin

from kampala import viz as V
from kampala.weblayers import class_layer, ramp_layer

DOCS = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "docs"
OUT = DOCS / "atlas"
LAYERS = OUT / "layers"
manifest = json.loads((OUT / "atlas.json").read_text(encoding="utf-8"))
H, W = manifest["size"]
G = manifest["grid"]
Y = manifest["years"]
DIVERGING = V.BLUE[::-1][:6] + [V.NEUTRAL] + V.REDS[1:]        # the stops of V.DIVERGING
NOTE = " Values read back from the published map image (about {m:.0f} m cells{extra})."

# the continuous layers: how 14_atlas.py coloured them, and how the page should word their values
RAMPS = {
    "lst-2025": dict(cmap=V.DIVERGING, colors=DIVERGING, vmin=-8, vmax=8, step=0.01, unit="°C", decimals=1, signed=True,
                     labels=["8 °C cooler", "city average", "8 °C hotter"], readout="{v} °C vs the city average",
                     label=f"Surface heat {Y[2]}", extra="; ±0.03 °C, values beyond ±8 °C read as ±8"),
    "lst-change": dict(cmap=V.DIVERGING, colors=DIVERGING, vmin=-4, vmax=4, step=0.01, unit="°C", decimals=1, signed=True,
                       labels=["cooled 4 °C", "no change", "warmed 4 °C"], readout="{v} °C since " + str(Y[0]),
                       label=f"Heat change {Y[0]}–{Y[2]}", extra="; ±0.02 °C, changes beyond ±4 °C read as ±4"),
    "solar": dict(cmap=V.seq(V.ORANGES), colors=V.ORANGES, vmin=0, vmax=None, step=0.01, unit="GWh/km²/yr", decimals=1,
                  signed=False, labels=None, readout="{v} GWh per km² a year from rooftops", hide_below=0.5,
                  label="Rooftop solar potential", extra="; blocks under 0.5 GWh/km² were left blank"),
}


def image_of(layer):
    """The published image for a layer: `image` once this script has run, else `src` (a .png)."""
    rel = layer.get("image") or layer["src"]
    if not rel.endswith(".png"):
        sys.exit(f"{layer['id']}: no published image to read (src is {rel}); this atlas.json came from 14_atlas.py.")
    return rel, np.asarray(Image.open(OUT / rel).convert("RGBA"))


def as_drawn(rgba):
    """Colour(s) exactly as 14_atlas.py wrote them: (rgba clipped to 0..1) * 255, truncated to uint8."""
    return (np.clip(np.asarray(rgba, dtype="float64"), 0, 1) * 255).astype("uint8")[..., :3]


def decode_classes(img, colors):
    """Class k (1..n) where the pixel has colors[k-1]; 0 where transparent or no class matches."""
    rgb = img[..., :3].astype(int)
    out = np.zeros(img.shape[:2], "uint8")
    for k, c in enumerate(colors, start=1):
        out[(np.abs(rgb - as_drawn(to_rgba(c)).astype(int)).sum(-1) <= 3) & (img[..., 3] > 0)] = k
    return out


def decode_ramp(img, cmap, vmin, vmax):
    """Value at the centre of each pixel's colour step (matplotlib's 256-entry table); NaN where transparent."""
    lut = as_drawn(cmap(np.arange(cmap.N))).astype(int)
    key = lambda a: (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]
    index = {int(k): i for i, k in enumerate(key(lut))}
    keys = key(img[..., :3].astype(int)).ravel()
    idx = np.array([index.get(int(k), -1) for k in keys])
    miss = idx < 0                                         # not an exact table colour: take the nearest
    if miss.any():
        px = img[..., :3].reshape(-1, 3)[miss].astype(int)
        idx[miss] = ((px[:, None, :] - lut[None]) ** 2).sum(-1).argmin(1)
    v = vmin + (idx.reshape(img.shape[:2]) + 0.5) / cmap.N * (vmax - vmin)
    v[img[..., 3] == 0] = np.nan
    return v


layers = []
h = w = None
for old in manifest["layers"]:
    rel, img = image_of(old)
    h, w = img.shape[:2]
    pixel = G["pixel"] * W / w                             # the image spans the same ground as the grid
    T = from_origin(G["origin"][0], G["origin"][1], pixel, pixel)
    caption = re.sub(r" Values read back from the published map image.*$", "", old["caption"])
    if old["id"] in RAMPS:
        r = RAMPS[old["id"]]
        if r["vmax"] is None:                              # solar: the legend's top end (rounded when published)
            legend = old["legend"] if "legend" in old else old["style"]["labels"]
            r["vmax"] = float(legend[2])
            r["labels"] = ["0", "GWh per km² a year", legend[2]]
        data = ramp_layer(LAYERS, old["id"], decode_ramp(img, r["cmap"], r["vmin"], r["vmax"]), step=r["step"],
                          unit=r["unit"], colors=r["colors"], vmin=r["vmin"], vmax=r["vmax"], labels=r["labels"],
                          readout=r["readout"], decimals=r["decimals"], signed=r["signed"], hide_below=r.get("hide_below"),
                          crs=G["crs"], transform=T)
        label, extra = r["label"], r["extra"]
    else:
        pairs = old["legend"] if "legend" in old else [(c["color"], c["name"]) for c in old["style"]["classes"]]
        colors, names = [c for c, _ in pairs], [n for _, n in pairs]
        data = class_layer(LAYERS, old["id"], decode_classes(img, colors), colors, names, G["crs"], T)
        label, extra = old["label"], ""
    layers.append(dict(id=old["id"], group=old["group"], label=label, caption=caption + NOTE.format(m=pixel, extra=extra),
                       image=rel, **data))
    print(f"  {old['id']:16s} {w}x{h} px -> {data['src']} ({(OUT / data['src']).stat().st_size / 1e6:.2f} MB)")

new = dict(size=[h, w], years=Y, base=manifest["base"],
           grid=dict(crs=G["crs"], origin=G["origin"], pixel=round(G["pixel"] * W / w, 6)), layers=layers)
anims = {k: v for k, v in manifest.get("anims", {}).items() if k == "wind" and (OUT / v).exists()}
if anims:
    new["anims"] = anims                                   # shown until stats.json has the wind table
(OUT / "atlas.json").write_text(json.dumps(new, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {OUT / 'atlas.json'}: {len(layers)} layers as data, {w}x{h} cells of {new['grid']['pixel']:.1f} m")
