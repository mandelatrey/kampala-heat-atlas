"""Power cuts for the atlas (format: src/kampala/power.py): reported cuts by area, upcoming planned cuts, when in the
day cuts are reported, and published figures from studies and news.

    python scripts/33_power.py                    # config/power/ -> docs/power/power.json
    python scripts/33_power.py LOG SAMPLING OUT   # other files (published.csv is read next to SAMPLING)

Needs only docs/atlas/places.json (to place area names). Re-run after editing any file in config/power/.
"""
import json
import sys
from datetime import date
from pathlib import Path

from kampala import power as P

ROOT = Path(__file__).resolve().parents[1]
LOG = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "config" / "power" / "outage_log.csv"
SAMPLING = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "config" / "power" / "sampling.csv"
ATLAS = ROOT / "docs" / "atlas"
OUT = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / "docs" / "power" / "power.json"
NEAR_LOGGED_KM = 1.0      # how close a place must be to a logged area to show its reports
TODAY = date.today()


def main() -> None:
    places = json.loads((ATLAS / "places.json").read_text(encoding="utf-8"))["places"]

    rows = P.read_log(LOG) if LOG.exists() else []
    windows = P.read_sampling(SAMPLING) if SAMPLING.exists() else []
    unknown = sorted(set(P.locate(rows, places)) | set(P.locate(windows, places)))
    if unknown:
        print(f"  no place called {', '.join(unknown)} in places.json: give those rows lat and lon", file=sys.stderr)
    found = P.areas(rows, windows, TODAY)
    for a in found:
        if not a.sampled:
            print(f"  {a.name}: reports but no sampling period, so shown as reports only", file=sys.stderr)
    per_day = P.hours_per_cut_day(rows)
    published_file = SAMPLING.parent / "published.csv"
    published = P.read_published(published_file, places) if published_file.exists() else []

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(
        generated=TODAY.isoformat(), log_rows=len(rows), near_logged_km=NEAR_LOGGED_KM,
        hours_per_cut_day=None if per_day is None else round(per_day, 1),
        reported_hours=P.reported_hours(rows), published=published,
        areas=[dict(name=a.name, lat=round(a.lat, 5), lon=round(a.lon, 5), basis=a.basis, first=a.first, last=a.last,
                    days=a.days, cut_days=a.cut_days, cut_days_week=round(a.cut_days_week, 2),
                    hours_week=None if a.hours_week is None else round(a.hours_week, 1), kinds=a.kinds, sources=a.sources)
               for a in found],
        planned=P.upcoming(rows, TODAY),
    ), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT}: {len(rows)} log rows, {len(found)} areas ({sum(a.sampled for a in found)} with a sampling period), "
          f"{len(published)} published figures, {len(P.upcoming(rows, TODAY))} upcoming planned cuts")


if __name__ == "__main__":
    main()
