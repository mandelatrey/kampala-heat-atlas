"""Power cuts for the atlas: hours a week without grid power in each logged area, upcoming planned cuts, and, when
it predicts well enough, an estimate for every named place (format and model: src/kampala/power.py).

    python scripts/33_power.py              # reads config/power/outage_log.csv, writes docs/power/power.json
    python scripts/33_power.py LOG OUT      # another log / output (e.g. to try the model on test data)

Needs only the published atlas (docs/atlas/: atlas.json, places.json, the land cover, growth and housing GeoTIFFs),
not the thesis data, so it can run anywhere the repository is checked out. Re-run after editing the log.
"""
import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform

from kampala import power as P

ROOT = Path(__file__).resolve().parents[1]
LOG = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "config" / "power" / "outage_log.csv"
ATLAS = ROOT / "docs" / "atlas"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "docs" / "power" / "power.json"
RADIUS_M = 500            # same circle as the atlas's "find your area" summary
NEAR_LOGGED_KM = 1.0      # places this close to a logged area show that area's record, not an estimate
TODAY = date.today()


def main() -> None:
    atlas = json.loads((ATLAS / "atlas.json").read_text(encoding="utf-8"))
    places = json.loads((ATLAS / "places.json").read_text(encoding="utf-8"))["places"]
    grid = atlas["grid"]
    src = {l["id"]: l["src"] for l in atlas["layers"]}
    layers = {}
    for key, lid in (("lc", f"landcover-{atlas['years'][-1]}"), ("growth", "growth"), ("informal", f"informal-{atlas['years'][-1]}")):
        with rasterio.open(ATLAS / src[lid]) as r:
            layers[key] = r.read(1)
    offsets = P.disk(RADIUS_M / grid["pixel"])

    def feats(lat: float, lon: float):
        (x,), (y,) = transform("EPSG:4326", grid["crs"], [lon], [lat])
        return P.features_at((grid["origin"][1] - y) / grid["pixel"], (x - grid["origin"][0]) / grid["pixel"], layers, offsets, lat, lon)

    rows = P.read_log(LOG) if LOG.exists() else []
    unknown = P.locate(rows, places)
    if unknown:
        print(f"  no place called {', '.join(unknown)} in places.json: give those rows lat and lon", file=sys.stderr)
    found = P.areas(rows, TODAY)
    for a in found:
        a.features = feats(a.lat, a.lon) or {}
    model = P.choose_model(found)

    estimates = []
    if model.used:
        logged = [(a.lat, a.lon) for a in found]
        todo = [p for p in places if not any(P.km((p["lat"], p["lon"]), q) < NEAR_LOGGED_KM for q in logged)]
        withf = [(p, f) for p in todo if (f := feats(p["lat"], p["lon"]))]
        if withf:
            X = np.array([[f[k] for k in P.FEATURES] for _, f in withf])
            hours = model.predict([(p["lat"], p["lon"]) for p, _ in withf], X)
            estimates = [dict(name=p["name"], lat=p["lat"], lon=p["lon"], hours_week=round(max(float(h), 0.0), 1)) for (p, _), h in zip(withf, hours)]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(
        generated=TODAY.isoformat(), log_rows=len(rows), radius_m=RADIUS_M, near_logged_km=NEAR_LOGGED_KM,
        areas=[dict(name=a.name, lat=round(a.lat, 5), lon=round(a.lon, 5), days=a.days, zero_days=a.zero_days,
                    rate="diary" if a.diary else "reported only", hours_week=round(a.hours_week, 1),
                    cuts_week=None if a.cuts_week is None else round(a.cuts_week, 1), cut_days=a.kinds,
                    first=a.first, last=a.last, sources=a.sources) for a in found],
        model=model.summary(), estimates=estimates, planned=P.upcoming(rows, TODAY),
    ), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    m = model.summary()
    print(f"wrote {OUT}: {len(rows)} log rows, {len(found)} areas ({sum(a.diary for a in found)} with diary days), "
          f"model {m['chosen']} ({'used' if m['used'] else 'not used'}; held-out error {m['loo_mae_hours_week']}), "
          f"{len(estimates)} place estimates, {len(P.upcoming(rows, TODAY))} upcoming planned cuts")


if __name__ == "__main__":
    main()
