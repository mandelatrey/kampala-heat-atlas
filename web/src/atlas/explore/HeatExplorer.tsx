import { useMemo, useRef, useState } from "react";
import { focusOnMap } from "../focus";
import { gridGeo } from "../geo";
import { PlaceSearch, type Focus } from "../PlaceCard";
import { placeContext, usePlaces, type Place } from "../places";
import { valueAt } from "../raster";
import { signed, type Stats } from "../stats";
import { cellsWithin } from "../summary";
import type { Atlas } from "../types";
import { hotterThan, lczCode, LCZ_WORDS, rankPlaces, spreadOut, type Ranked } from "./logic";
import { useLayers, useNearScreen, type Layers } from "./useLayers";

const RADIUS_M = 500;
const SHOW = 8;

/** "Hottest and coolest neighbourhoods" (a ranking of named places) and "What kind of place runs hot?" (the zones). */
export function HeatExplorer({ atlas, stats }: { atlas: Atlas; stats: Stats }) {
  const box = useRef<HTMLDivElement>(null);
  const y2 = atlas.years[2];
  const layers = useLayers(atlas, [`lst-${y2}`, `landcover-${y2}`], useNearScreen(box));
  return (
    <div className="explore" ref={box}>
      <div className="explore-grid one">
        {layers.state === "loading" && <p className="muted">Loading the heat map…</p>}
        {layers.state === "error" && <p className="muted">The heat map could not be loaded ({layers.message}).</p>}
        {layers.state === "ready" && <Ranking atlas={atlas} layers={layers.data} />}
        <Zones stats={stats} />
      </div>
    </div>
  );
}

function Ranking({ atlas, layers }: { atlas: Atlas; layers: Layers }) {
  const placesLoad = usePlaces();
  const places = placesLoad.state === "ready" ? placesLoad.data.places : [];
  const [h, w] = atlas.size;
  const y2 = atlas.years[2];
  const geo = useMemo(() => gridGeo(atlas.grid, h, w), [atlas.grid, h, w]);
  const ranked = useMemo(() => {
    const heat = layers[`lst-${y2}`]!, lc = layers[`landcover-${y2}`]!;
    const builtClasses = lc.layer.style.kind === "classes" ? lc.layer.style.classes.filter((c) => c.name.startsWith("built")).map((c) => c.value) : [1, 2];
    return rankPlaces(
      places,
      (p) => cellsWithin(geo.cellAt(p.lat, p.lon), RADIUS_M, atlas.grid.pixel, w, h),
      (cell) => valueAt(heat.raster, heat.layer.values!, Math.floor(cell / w), cell % w),
      (cell) => builtClasses.includes(valueAt(lc.raster, lc.layer.values!, Math.floor(cell / w), cell % w) ?? -1),
    );
  }, [places, layers, geo, atlas.grid.pixel, w, h, y2]);
  const [mine, setMine] = useState<{ focus: Focus; ranked: Ranked | null } | null>(null);

  if (!places.length) return <p className="muted">The ranking needs the place names, which are not available.</p>;
  const max = Math.max(...ranked.map((r) => Math.abs(r.anom)), 1);
  const show = (p: Place) => focusOnMap({ lat: p.lat, lon: p.lon, name: p.name, context: placeContext(p, places) });
  const row = (r: Ranked) => (
    <li key={`${r.place.name}|${r.place.lat}|${r.place.lon}`}>
      <button type="button" className="rank-row" onClick={() => show(r.place)} title="Show on the map">
        <span className="rank-name"><b>{r.place.name}</b><small>{placeContext(r.place, places)}</small></span>
        <span className="rank-bar"><i className={r.anom >= 0 ? "hot" : "cool"} style={{ width: `${(Math.abs(r.anom) / max) * 100}%` }} /></span>
        <span className="rank-val">{signed(r.anom)} °C</span>
      </button>
    </li>
  );
  return (
    <section className="explore-card" aria-labelledby="rank-title">
      <h3 id="rank-title">Hottest and coolest neighbourhoods</h3>
      <p className="muted">How hot the ground and roofs get within {RADIUS_M} m of each named place, compared with the city average, in the {y2} dry season. Neighbouring places are listed once. Tap a name to see it on the map.</p>
      <div className="rank-cols">
        <div>
          <span className="eyebrow">Hottest</span>
          <ol className="rank-list">{spreadOut(ranked, SHOW).map(row)}</ol>
        </div>
        <div>
          <span className="eyebrow">Coolest</span>
          <ol className="rank-list">{spreadOut([...ranked].reverse(), SHOW).map(row)}</ol>
        </div>
      </div>
      <div className="calc-where">
        <PlaceSearch places={places} title="Where does your area rank?" hint=""
          onPick={(f) => setMine({ focus: f, ranked: ranked.find((r) => r.place.name === f.name && r.place.lat === f.lat && r.place.lon === f.lon) ?? null })} />
      </div>
      {mine && (
        <p aria-live="polite">
          {mine.ranked
            ? <><b>{mine.focus.name}</b>: {signed(mine.ranked.anom)} °C, hotter than {Math.round(hotterThan(ranked, mine.ranked))}% of the {ranked.length.toLocaleString("en-GB")} built-up places ranked. </>
            : <><b>{mine.focus.name}</b> is less than half built up within {RADIUS_M} m, so it is not in this ranking of built-up neighbourhoods. </>}
          <button type="button" className="linkbtn" onClick={() => focusOnMap(mine.focus)}>Show it on the map</button>
        </p>
      )}
      <p className="fine">
        Even the coolest built-up places run close to the city average: the cool parts of Kampala are its trees, wetlands and farmland.{" "}
        {ranked.length.toLocaleString("en-GB")} named places (OpenStreetMap) whose surroundings are at least half built up. Ground and roof temperature from
        satellites, not the air temperature you feel.
      </p>
    </section>
  );
}

function Zones({ stats }: { stats: Stats }) {
  const c = stats.charts.lcz;
  const zones = useMemo(() => [...c.zones].sort((a, b) => b.values[1] - a.values[1]), [c.zones]);
  const [sel, setSel] = useState(zones[0]?.name ?? "");
  const z = zones.find((x) => x.name === sel) ?? zones[0];
  if (!z) return null;
  const words = LCZ_WORDS[lczCode(z.name)];
  const [a, b] = c.years;
  const lo = Math.min(-3, ...zones.map((x) => x.values[1])), hi = Math.max(8, ...zones.map((x) => x.values[1]));
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const d = z.values[1] - z.values[0];
  return (
    <section className="explore-card" aria-labelledby="zones-title">
      <h3 id="zones-title">What kind of place runs hot?</h3>
      <p className="muted">Every part of the city is one of these kinds of place. Pick one.</p>
      <div className="chips zone-chips" role="group" aria-label="Kind of place">
        {zones.map((x) => (
          <button key={x.name} type="button" className="chip" aria-pressed={x.name === z.name} onClick={() => setSel(x.name)}>
            {LCZ_WORDS[lczCode(x.name)]?.name ?? x.name}
          </button>
        ))}
      </div>
      <div className="zone-card" aria-live="polite">
        <b>{words?.name ?? z.name}</b>
        {words && <p>{words.looks}</p>}
        <div className="scale" aria-hidden="true">
          <span className="scale-zero" style={{ left: pos(0) }} />
          <span className={`scale-dot then`} style={{ left: pos(z.values[0]) }} title={String(a)} />
          <span className={`scale-dot now ${z.values[1] >= 0 ? "hot" : "cool"}`} style={{ left: pos(z.values[1]) }} title={String(b)} />
          <span className="scale-label" style={{ left: pos(0) }}>city average</span>
        </div>
        <p>
          Ground and roofs here run <b>{signed(z.values[1])} °C</b> {z.values[1] >= 0 ? "above" : "compared with"} the city average in {b}
          {Math.abs(d) >= 0.3 ? <> ({d > 0 ? "up" : "down"} from {signed(z.values[0])} °C in {a})</> : <> (about the same as in {a})</>}.
        </p>
      </div>
      <p className="fine">Local Climate Zones (Stewart and Oke 2012) from the global map by Demuzere et al. (2022); the research name for this one is "{z.name.replace(/^\S+\s/, "")}".</p>
    </section>
  );
}
