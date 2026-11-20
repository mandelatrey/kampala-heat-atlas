# Kampala Heat Atlas

Open-data research on how Kampala grew between 2017 and 2025, where it is hottest, who lives in the
heat, and what trees and rooftops could do about it, with a 3D model of sun, shade and the Lake
Victoria breeze.

**Website:** https://gavacharles.github.io/kampala-heat-atlas/
- [Atlas](https://gavacharles.github.io/kampala-heat-atlas/): 11 map layers (heat, growth, settlements, trees, solar)
- [3D model](https://gavacharles.github.io/kampala-heat-atlas/3d.html): three districts with real-time sun shadows and breeze arrows
- [Figures & animations](https://gavacharles.github.io/kampala-heat-atlas/gallery.html)
- **Heat today** (`app/#/heat`, any town at `#/heat/<site>`): a public heat advisory from forecast heat stress (WBGT), Low to Extreme with its hours, what to do for outdoor workers and boda riders, market vendors, schools and older people, and a WhatsApp message and image card to pass on (`scripts/heat_advisory.py`, levels in `thresholds.json` → `heat_advisory`, tests in `tests/test_heat_advisory.py`).
- [Site weather](https://gavacharles.github.io/kampala-heat-atlas/site-weather/central-kampala/): an **Everyday** view for the public (hour by hour, fine / with care / avoid for getting around, weddings and outdoor events, moving goods, laundry, children and older people outside, exercise, spraying and drying harvest; `scripts/everyday.py`, limits in `thresholds.json` → `everyday`, tests in `tests/test_everyday.py`) and a **Construction** view: 7-day workable hours per trade (heat/WBGT, concrete, cranes, work at height, coatings, earthworks), a daily site note, and a month-by-month weather record against the 1991–2020 climate, refreshed daily by `scripts/29_site_weather.py`. Thresholds are editable in `docs/site-weather/thresholds.json` and are screening values only: the contract, crane manufacturer and site H&S plan take precedence. Weather data: Open-Meteo (CC BY 4.0); its free API is for non-commercial use, so commercial use of this service needs an Open-Meteo subscription.

Status: first full run of PhD research (Gava Charles). Several layers carry open validation items,
listed on the site next to each result. Please don't cite numbers without checking the caveats.

## What is in it

| Module | Question | Method |
|---|---|---|
| M0 Cube | What terrain, building heights, sun and wind define Kampala? | FABDEM, Open Buildings 2.5D Temporal, pvlib, ERA5-Land |
| M1 Growth | How did the city grow, 2017–2025? | Three-date Sentinel-2 random forest, Dynamic World weak labels, building-evidence constraint |
| M2 Heat | Which thermal zones exist? | Gap-free Landsat LST (TOA + NDVI emissivity, calibrated to C2 ST), LCZ |
| M3 Settlements | Are informal settlements heating faster? | Building-morphology typology, thermal trajectories |
| M4 Trees | Where should trees go? | Heat × people × canopy deficit where space exists, cooling model |
| M5 Solar | How far can rooftop solar scale? | 2.0 M Overture roofs, ERA5-Land irradiance, adoption scenarios |
| M6 3D model | Why: shade, sky view, ventilation, orientation | 2 m ray-traced shadows, sky view factor, potential flow, frontal area index |

## Reproduce

```bash
python3.12 -m venv ~/.venvs/kampala && source ~/.venvs/kampala/bin/activate
pip install -e . && pip install geedim duckdb pyvista imageio statsmodels netcdf4
earthengine authenticate          # then set earth_engine.project in config/config.yaml
python scripts/00_check_setup.py
```

| Step | Script |
|---|---|
| Sun geometry, terrain + buildings, wind | `01`, `02`, `03` |
| Footprints (Overture) | `04` |
| LST, MODIS, LCZ | `05` |
| Carry over earlier work (author's own repos) | `06` |
| Land cover, change, building constraint | `07`, `07b`, `07c` |
| Thermal classes · settlements · trees · solar | `08`, `09`/`09b`, `10`, `11` |
| Figures · animations · atlas | `12`, `13`, `14` (map layers), `14c` (numbers and charts); without the rasters, `14d` (map layers from the published images) |
| Place names for the maps and the atlas search (OpenStreetMap via Overpass, or `--tiles` for OpenFreeMap's vector tiles; needs internet) | `14b` |
| 3D model · 3D visuals · website | `15`, `16`, `17` |
| Power cuts: published utility-record figures, news and residents' complaints in `config/power/` (see its README) | `33` |

Large data go to `~/kampala-thesis-data` (set in `config/config.yaml`) and are not in this repository.

## Web app (`web/`)

The pages are moving, one at a time, to a React + TypeScript app in `web/`. Python still does all the
analysis and writes data files into `docs/`; the app only reads them.

| Page | App route | Data (written by) |
|---|---|---|
| Atlas (the home page; `index.html` forwards to it) | `app/#/atlas` | `docs/atlas/` (`scripts/14_atlas.py`, `14c_atlas_stats.py`) |
| 3D model (`3d.html` forwards to it) | `app/#/3d` | `docs/data/districts.json`, `docs/data/district_*.json` (`scripts/17_build_site.py`) |
| Site weather | `app/#/site-weather`, `app/#/site-weather/<site>` | `docs/site-weather/` (`scripts/29_site_weather.py`, `31_site_weather_all.py`) |

The atlas draws everything from data rather than from pictures:

- **Map layers** are Cloud-Optimized GeoTIFFs (`docs/atlas/layers/*.tif`, written by `scripts/14_atlas.py` through
  `src/kampala/weblayers.py`). The page colours them itself with the palette listed in `atlas.json`, reads the value
  under the cursor or a tap, and offers each file for download (they open in QGIS with real values and units). The
  street map underneath is OpenFreeMap (OpenStreetMap data, no API key), drawn with MapLibre GL. Browsers that
  cannot run WebGL 2 (WebGL turned off, privacy-hardened browsers, older and budget phones whose graphics stop at
  OpenGL ES 2) get the same map drawn with Leaflet over Esri's grey canvas tiles instead (`web/src/atlas/mapEngine.ts`).
- **Numbers and charts** come from `docs/atlas/stats.json`, which `scripts/14c_atlas_stats.py` computes from the result
  tables in `outputs/tables/`. It needs no rasters, so it runs anywhere; it also copies each chart's table into
  `docs/atlas/tables/`, and the page links every chart to its table. On the author's machine it also refreshes two
  small tables from the data folder (hourly wind for the wind rose; persistent hot-spot area).
- An `atlas.json` written before this change (layers as coloured PNGs) still displays, without values under the cursor.
- **Simple / Detailed**: the atlas opens in plain words (simple mode; the choice is remembered per browser). Each module
  gives its findings plainly, a "How sure are we?" badge, and the research text under "How we know this"; map layers get
  plain names (`web/src/atlas/simple.ts`). Underlined terms open a short definition from `web/src/glossary.ts`, which
  is also listed at the bottom of the page (`#/atlas/glossary`).
- **Find your area**: a search box over the map (place names from `docs/atlas/places.json`, made by `14b_places.py`),
  "Near me", and "Summarise this area" in the tap popup open a card that sums up the data layers within 500 m: how the
  heat ranks against the whole atlas area, change since the first epoch, ground cover and new building, tree-planting
  priority, rooftop solar and informal-type housing (`web/src/atlas/summary.ts`, all computed in the browser).
- **Without the analysis rasters** (they come from scripts 01–13 and live in `paths.data_root`, outside git),
  `14_atlas.py` stops before changing anything. `python scripts/14d_layers_from_images.py` instead reads the published
  layer images back into the same GeoTIFF format: categories exactly, continuous layers to one colour step (±0.03 °C
  for surface heat), on the images' ~51 m cells rather than 30 m. Each caption says so. That is what `docs/atlas/` holds
  now; run `14_atlas.py` where the rasters exist to replace it with full-resolution data.

To preview a pipeline run before committing it, write it somewhere else and point the dev server at it:
`KHA_DOCS=/path/to/docs npm run dev`.

The rooftop solar module has a calculator (bill saving, payback, battery cover in power cuts) that reads ERA's
end-user prices from `docs/power/tariffs.json`: update that file each quarter. The "find your area" card and the
calculator show power cuts from `docs/power/power.json` (`scripts/33_power.py`): measured figures from studies of the
utility's outage records for the areas they cover, a typical Kampala range elsewhere, plus news and residents' complaints.

The 3D model uses deck.gl 9 (with its React bindings), loaded only on that page. Stories, day vs night, the
meteogram, the gallery and the site-weather map are still generated by the Python scripts.

```bash
cd web
npm install
npm run dev        # http://localhost:5173/, reading data from ../docs
npm test           # unit tests, plus a check that docs/atlas/ has everything the atlas page reads
npm run build      # type-check and build into docs/app/
```

`docs/app/` is not committed: the GitHub workflow builds it before each deploy. The data contract between
the two halves is `web/src/types.ts`, `web/src/atlas/types.ts` and `web/src/viewer3d/types.ts`; if a script changes what it writes,
update the types there.

## Licences

Code: MIT (`LICENSE`). Maps and derived layers inherit their input licences, and anything using
FABDEM terrain is non-commercial (`DATA_LICENSE.md`).
© OpenStreetMap contributors · Overture Maps Foundation · Google Open Buildings · Copernicus · USGS · ECMWF.
