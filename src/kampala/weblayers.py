"""Map layers for the web atlas as data: Cloud-Optimized GeoTIFFs plus a style the page draws them with.

The page (web/src/atlas/raster.ts) reads each GeoTIFF, turns stored integers back into values with
`value = stored * scale + offset`, and colours them itself, so it can also say what value is under the cursor.
The same files open in QGIS with real values (scale, offset, nodata and units are set in the file).

Contract: web/src/atlas/types.ts (DataLayer). Change both together.
"""
from pathlib import Path

import numpy as np
import rasterio

INT16_NODATA = -32768


def quantise(a, scale, mask=None):
    """float array -> int16 steps of `scale`; NaN, inf and `mask` become nodata."""
    a = np.asarray(a, dtype="float64")
    bad = ~np.isfinite(a)
    if mask is not None:
        bad |= mask
    q = np.clip(np.round(np.where(bad, 0, a) / scale), -32767, 32767).astype("int16")
    q[bad] = INT16_NODATA
    return q


def write_cog(path: Path, a, crs, transform, *, nodata=None, scale=1.0, unit=""):
    """One band, DEFLATE with a predictor, 512 px tiles, no overviews (the page reads the whole grid)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    prof = dict(driver="COG", width=a.shape[1], height=a.shape[0], count=1, dtype=str(a.dtype), crs=crs,
                transform=transform, nodata=nodata, compress="DEFLATE", predictor=2, level=9, blocksize=512,
                overviews="NONE")
    with rasterio.open(path, "w", **prof) as dst:
        dst.write(a, 1)
        dst.scales = (scale,)
        dst.offsets = (0.0,)
        if unit:
            dst.units = (unit,)


def class_layer(out_dir: Path, name, a, colors, names, crs, transform):
    """Categorical raster: class k (1..n) is colors[k-1] / names[k-1]; 0 is empty."""
    a = np.asarray(a).astype("uint8")
    write_cog(out_dir / f"{name}.tif", a, crs, transform, nodata=0)
    return dict(src=f"layers/{name}.tif", values=dict(scale=1, offset=0, nodata=0),
                style=dict(kind="classes", classes=[dict(value=k, color=c, name=n)
                                                    for k, (c, n) in enumerate(zip(colors, names), start=1)]))


def ramp_layer(out_dir: Path, name, a, *, step, unit, colors, vmin, vmax, labels, readout, decimals, crs, transform,
               mask=None, signed=False, hide_below=None):
    """Continuous raster stored as int16 steps of `step`; drawn with `colors` spread evenly from vmin to vmax.

    readout: how the page words a value, with {v} for the formatted number, e.g. "{v} °C vs the city land mean".
    hide_below: values under this are drawn transparent (they stay in the data).
    """
    q = quantise(a, step, mask)
    write_cog(out_dir / f"{name}.tif", q, crs, transform, nodata=INT16_NODATA, scale=step, unit=unit)
    style = dict(kind="ramp", colors=list(colors), min=vmin, max=vmax, labels=list(labels))
    if hide_below is not None:
        style["hide_below"] = hide_below
    return dict(src=f"layers/{name}.tif",
                values=dict(scale=step, offset=0, nodata=INT16_NODATA, unit=unit, decimals=decimals, signed=signed,
                            readout=readout),
                style=style)
