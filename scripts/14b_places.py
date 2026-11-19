"""Place names for the atlas map and the 3D viewer, from OpenStreetMap.

    python scripts/14b_places.py              # writes docs/atlas/places.json
    python scripts/14b_places.py --tiles      # skip Overpass, read OpenFreeMap's vector tiles directly

Needs internet access. Asks an Overpass API server first (standard library only); if none answers, reads the
same OpenStreetMap places from OpenFreeMap's vector tiles (OpenMapTiles schema, zoom 14; needs
`pip install mapbox-vector-tile`). Places come from OpenStreetMap (c) OpenStreetMap contributors, ODbL 1.0;
the page credits them. The atlas search box and the "near ..." readouts use this file.

Writes {"source", "fetched", "bbox", "places": [{"name", "kind", "rank", "lat", "lon"}]} where rank 1 is
shown at every zoom (cities) and higher ranks appear as you zoom in.
"""
import datetime as dt
import gzip
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "atlas" / "places.json"
SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

# kind -> rank (1 always shown ... 5 only close in)
RANK = {"city": 1, "town": 2, "suburb": 3, "island": 3, "village": 4, "quarter": 4, "hill": 4, "peak": 4, "neighbourhood": 5}
UA = {"User-Agent": "kampala-heat-atlas (place names for maps)"}
OFM = "https://tiles.openfreemap.org/planet"


def bbox() -> tuple[float, float, float, float]:
    """The study area, [west, south, east, north], from config/config.yaml (read without PyYAML)."""
    for line in (ROOT / "config" / "config.yaml").read_text().splitlines():
        if line.strip().startswith("extended_bbox:"):
            w, s, e, n = json.loads(line.split(":", 1)[1].split("#")[0])
            return w, s, e, n
    raise SystemExit("extended_bbox not found in config/config.yaml")


def query(w: float, s: float, e: float, n: float) -> str:
    b = f"({s},{w},{n},{e})"
    return (f'[out:json][timeout:90];('
            f'node["place"~"^(city|town|suburb|quarter|neighbourhood|island)$"]["name"]{b};'
            f'node["natural"~"^(peak|hill)$"]["name"]{b};'
            f');out body;')


def fetch(q: str) -> dict:
    last = None
    for url in SERVERS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers=UA)
                with urllib.request.urlopen(req, timeout=120) as r:
                    return json.load(r)
            except Exception as err:                       # noqa: BLE001 - report and try the next server
                last = err
                print(f"  {url}: {err}", file=sys.stderr)
                time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"no Overpass server answered ({last})")


def from_tiles(w: float, s: float, e: float, n: float, z: int = 14) -> list[dict]:
    """Named places from OpenFreeMap's vector tiles (layers place and mountain_peak), as Overpass-style elements."""
    import mapbox_vector_tile                                   # only needed for this fallback

    def get(url):
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            raw = r.read()
        return gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw

    template = json.loads(get(OFM))["tiles"][0]
    N = 2 ** z
    tx = lambda lon: int((lon + 180) / 360 * N)
    ty = lambda lat: int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * N)
    tiles = [(x, y) for x in range(tx(w), tx(e) + 1) for y in range(ty(n), ty(s) + 1)]
    print(f"  reading {len(tiles)} OpenFreeMap tiles at zoom {z}", file=sys.stderr)

    def one(xy):
        x, y = xy
        t = mapbox_vector_tile.decode(get(template.format(z=z, x=x, y=y)), default_options={"y_coord_down": True})
        out = []
        for layer, kind_key in (("place", "class"), ("mountain_peak", "class")):
            lay = t.get(layer, {})
            ext = lay.get("extent", 4096)
            for f in lay.get("features", []):
                g = f["geometry"]
                if g["type"] != "Point":
                    continue
                gx, gy = g["coordinates"]
                px, py = x + gx / ext, y + gy / ext
                lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * py / N))))
                lon = px / N * 360 - 180
                if not (s <= lat <= n and w <= lon <= e):
                    continue                                    # tile buffers reach past the area
                tags = {k: v for k, v in f["properties"].items() if k.startswith("name")}
                kind = f["properties"].get(kind_key)
                tags["natural" if layer == "mountain_peak" else "place"] = kind
                out.append(dict(type="node", lat=lat, lon=lon, tags=tags))
        return out

    with ThreadPoolExecutor(4) as pool:                         # a free service: a few requests at a time
        return [el for part in pool.map(one, tiles) for el in part]


def km(a: dict, b: dict) -> float:
    dy = (a["lat"] - b["lat"]) * 111.32
    dx = (a["lon"] - b["lon"]) * 111.32 * math.cos(math.radians(a["lat"]))
    return math.hypot(dx, dy)


def places(osm: dict) -> list[dict]:
    """Named places, best-ranked first; a name repeated within 1.5 km keeps only its best-ranked point."""
    out = []
    for el in osm.get("elements", []):
        tags = el.get("tags", {})
        kind = tags.get("place") or tags.get("natural")
        name = tags.get("name:en") or tags.get("name")
        if el.get("type") != "node" or kind not in RANK or not name:
            continue
        out.append(dict(name=name.strip(), kind=kind, rank=RANK[kind], lat=round(el["lat"], 5), lon=round(el["lon"], 5)))
    out.sort(key=lambda p: (p["rank"], p["name"]))
    kept: list[dict] = []
    for p in out:
        if not any(k["name"].lower() == p["name"].lower() and km(k, p) < 1.5 for k in kept):
            kept.append(p)
    return kept


if __name__ == "__main__":
    w, s, e, n = bbox()
    try:
        if "--tiles" in sys.argv:
            raise RuntimeError("--tiles given")
        found, via = places(fetch(query(w, s, e, n))), "the Overpass API"
    except RuntimeError as err:
        print(f"{err}; reading OpenFreeMap's vector tiles instead", file=sys.stderr)
        found, via = places(dict(elements=from_tiles(w, s, e, n))), "OpenFreeMap vector tiles (OpenMapTiles)"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(
        source=f"© OpenStreetMap contributors (ODbL 1.0), via {via}",
        fetched=f"{dt.date.today():%Y-%m-%d}", bbox=[w, s, e, n], places=found), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {k: sum(p["kind"] == k for p in found) for k in RANK}
    print(f"wrote {OUT} ({len(found)} places: {', '.join(f'{v} {k}' for k, v in counts.items() if v)})")
