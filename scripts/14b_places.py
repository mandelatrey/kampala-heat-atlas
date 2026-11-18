"""Place names for the atlas map and the 3D viewer, from OpenStreetMap.

    python scripts/14b_places.py              # writes docs/atlas/places.json

Needs internet access to an Overpass API server; uses the standard library only. Places come from
OpenStreetMap (c) OpenStreetMap contributors, ODbL 1.0; the page credits them under the map.

Writes {"source", "fetched", "bbox", "places": [{"name", "kind", "rank", "lat", "lon"}]} where rank 1 is
shown at every zoom (cities) and higher ranks appear as you zoom in.
"""
import datetime as dt
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "atlas" / "places.json"
SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

# kind -> rank (1 always shown ... 5 only close in)
RANK = {"city": 1, "town": 2, "suburb": 3, "island": 3, "quarter": 4, "hill": 4, "peak": 4, "neighbourhood": 5}


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
                req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(),
                                             headers={"User-Agent": "kampala-heat-atlas (place names for maps)"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    return json.load(r)
            except Exception as err:                       # noqa: BLE001 - report and try the next server
                last = err
                print(f"  {url}: {err}", file=sys.stderr)
                time.sleep(3 * (attempt + 1))
    raise SystemExit(f"no Overpass server answered ({last})")


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
    found = places(fetch(query(w, s, e, n)))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(
        source="© OpenStreetMap contributors (ODbL 1.0), via the Overpass API",
        fetched=f"{dt.date.today():%Y-%m-%d}", bbox=[w, s, e, n], places=found), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {k: sum(p["kind"] == k for p in found) for k in RANK}
    print(f"wrote {OUT} ({len(found)} places: {', '.join(f'{v} {k}' for k, v in counts.items() if v)})")
