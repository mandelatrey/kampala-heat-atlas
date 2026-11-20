import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { useIsDark } from "../theme";
import { atlasUrl } from "./data";
import { formatLatLon, gridGeo } from "./geo";
import { createMapEngine, type MapEngine } from "./mapEngine";
import { PlaceCard, PlaceSearch, type Focus } from "./PlaceCard";
import { onFocusRequest } from "./focus";
import { nearest, usePlaces, type Place } from "./places";
import { describe, getRaster, paint, valueAt, type Raster } from "./raster";
import { splitImage, yearSeries } from "./series";
import { cellsWithin, summarise, SUMMARY_LAYERS, type AreaSummary, type Loaded, type SummaryLayerId } from "./summary";
import type { Atlas, AtlasLayer } from "./types";

const RADIUS_M = 500;

type SummaryState = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: AreaSummary };

function Legend({ layer }: { layer: AtlasLayer }) {
  const s = layer.style;
  if (s.kind === "classes") {
    return (
      <div className="legend-classes">
        {s.classes.map((c) => <span key={c.value}><i style={{ background: c.color }} />{c.name}</span>)}
      </div>
    );
  }
  return (
    <div className="legend-ramp">
      <div className="bar" style={{ background: `linear-gradient(90deg,${s.colors.join(",")})` }} />
      <div className="ends">{s.labels.map((t) => <span key={t}>{t}</span>)}</div>
    </div>
  );
}

// painted layers, the few most recent kept (the year controls flip between them; each is ~4 MB of pixels)
const painted = new Map<string, ImageData>();
const KEEP_PAINTED = 4;

function layerPixels(layer: AtlasLayer, r: Raster): ImageData {
  let px = painted.get(layer.id);
  if (px) painted.delete(layer.id);              // re-inserted below as the most recent
  else {
    if (!layer.values) throw new Error(`${layer.id} has no values to paint`);
    px = new ImageData(paint(r, layer.values, layer.style), r.width, r.height);
  }
  painted.set(layer.id, px);
  while (painted.size > KEEP_PAINTED) painted.delete(painted.keys().next().value!);
  return px;
}

/** A layer as drawn, with the data behind it (for reading values under the cursor). */
interface Shown {
  layer: AtlasLayer;
  raster: Raster;
  image: ImageData;
}

interface Props {
  atlas: Atlas;
  layerId: string;
  onLayer: (id: string) => void;
}

type Status = { state: "idle" | "loading" } | { state: "error"; message: string };

/** The atlas map card: layer list, street map with the selected layer drawn from its data, legend, readout. */
export const AtlasMap = forwardRef<HTMLElement, Props>(function AtlasMap({ atlas, layerId, onLayer }, ref) {
  const [opacity, setOpacity] = useState(0.8);
  const [relief, setRelief] = useState(false);
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [cursor, setCursor] = useState<string | null>(null);
  const [basemapNote, setBasemapNote] = useState<{ why: string; hint: string } | null>(null);   // street map missing
  const mapEl = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<MapEngine | null>(null);   // MapLibre, or Leaflet without WebGL
  const engineNow = useRef(engine);
  engineNow.current = engine;
  const shown = useRef<Shown | null>(null);           // the selected layer as drawn
  const sides = useRef<{ left: Shown; right: Shown } | null>(null);   // comparing: earliest year | selected year
  const splitCol = useRef<number | null>(null);        // comparing: the grid column under the divider
  const dark = useIsDark();
  const darkNow = useRef(dark);
  const [h, w] = atlas.size;
  const layer = atlas.layers.find((l) => l.id === layerId) ?? atlas.layers[0];
  // years: the selected layer's other years, playing through them, and comparing the earliest with it
  const series = useMemo(() => (layer ? yearSeries(atlas.layers, layer.id) : null), [atlas.layers, layer]);
  const [playing, setPlaying] = useState(false);
  const [compare, setCompare] = useState(false);
  const [split, setSplit] = useState(50);              // divider position, % of the map's width
  const first = series?.[0];
  const before = compare && first && layer && first.layer.id !== layer.id ? first : null;
  const comparing = before !== null;
  const opacityNow = useRef(opacity);
  opacityNow.current = opacity;
  const splitNow = useRef(split);
  splitNow.current = split;
  const geo = useMemo(() => gridGeo(atlas.grid, h, w), [atlas.grid, h, w]);
  const placesLoad = usePlaces();
  const places: Place[] = placesLoad.state === "ready" ? placesLoad.data.places : [];
  const [focus, setFocus] = useState<Focus | null>(null);
  const [summary, setSummary] = useState<SummaryState>({ state: "loading" });
  const [locating, setLocating] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  // can this atlas be summarised? only with layers as data (an older atlas.json has pictures only)
  const summarisable = atlas.layers.some((l) => l.values && (SUMMARY_LAYERS as readonly string[]).includes(l.id));

  // the map, once: MapLibre where WebGL 2 runs, else Leaflet
  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;
    let made: MapEngine | null = null;
    const stop = new AbortController();
    createMapEngine(el, {
      bounds: geo.bounds, corners: geo.corners, dark: darkNow.current, opacity: opacityNow.current,
      onBasemapMissing: (why, hint) => !stop.signal.aborted && setBasemapNote({ why, hint }),
    }, stop.signal).then((m) => {
      if (!m) return;
      made = m;
      setEngine(m);
    }, (err: unknown) => {
      console.error("map: could not start", err);
      if (!stop.signal.aborted) setStatus({ state: "error", message: `the map could not start: ${err instanceof Error ? err.message : String(err)}` });
    });
    return () => {
      stop.abort();
      made?.remove();
      setEngine(null);
    };
  }, [geo]);

  // light or dark street map with the page
  useEffect(() => {
    darkNow.current = dark;
    engine?.setDark(dark);
  }, [dark, engine]);

  // optional relief shading, under the data layer
  useEffect(() => {
    if (!engine || !relief) return;
    engine.setRelief(new URL(atlasUrl(atlas.base), location.href).href);
    return () => engine.setRelief(null);
  }, [relief, engine, atlas.base]);

  // the selected layer (with the earliest year beside it when comparing): drawn from its data, or the older
  // ready-coloured image; swapped in place, so stepping through the years does not flash
  useEffect(() => {
    const m = engine;
    if (!m || !layer) return;
    let live = true;
    shown.current = null;
    sides.current = null;
    m.closePopup();
    setStatus({ state: "loading" });
    if (!layer.values) {
      m.setData({ url: new URL(atlasUrl(layer.src), location.href).href });
      setStatus({ state: "idle" });
      return () => {
        live = false;
      };
    }
    const wanted = before?.layer.values ? [before.layer, layer] : [layer];
    Promise.all(wanted.map((l) => getRaster(atlasUrl(l.src)).then((raster): Shown => ({ layer: l, raster, image: layerPixels(l, raster) }))))
      .then((drawn) => {
        if (!live) return;
        const right = drawn[drawn.length - 1]!;
        shown.current = right;
        if (drawn.length === 2) {
          sides.current = { left: drawn[0]!, right };
          redraw.current();
        } else {
          m.setData({ image: right.image });
        }
        setStatus({ state: "idle" });
      })
      .catch((err: unknown) => {
        if (!live) return;
        m.setData(null);                         // do not leave the previous layer up under this one's name
        setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      live = false;
    };
  }, [layer, before?.layer, engine]); // not on opacity (set below without redrawing); `before` by its layer

  // comparing: the earliest year left of the divider, the selected year right of it; redrawn as the divider
  // moves and as the map pans (the divider stays put on screen), at most once a frame
  const frame = useRef(0);
  const redraw = useRef(() => {});
  redraw.current = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const m = engineNow.current, s = sides.current, el = mapEl.current;
      if (!m || !s || !el) return;
      const { lat, lon } = m.unproject((splitNow.current / 100) * el.clientWidth, el.clientHeight / 2);
      const col = geo.cellAt(lat, lon)[1];
      splitCol.current = col;
      const { width, height } = s.right.image;
      const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
      splitImage(s.left.image.data, s.right.image.data, width, height, col, out);
      m.setData({ image: new ImageData(out, width, height) });
    });
  };
  useEffect(() => {
    if (comparing) redraw.current();
    else splitCol.current = null;
  }, [split, comparing]);
  useEffect(() => {
    if (!engine || !comparing) return;
    return engine.onMove(() => redraw.current());
  }, [engine, comparing]);

  // playing: show each year for a moment once it has loaded, and stop on the latest
  useEffect(() => {
    if (!playing || !series || status.state !== "idle") return;
    const i = series.findIndex((x) => x.layer.id === layer?.id);
    if (i < 0 || i >= series.length - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => onLayer(series[i + 1]!.layer.id), 1400);
    return () => window.clearTimeout(t);
  }, [playing, series, status, layer, onLayer]);
  useEffect(() => {
    if (!series) {
      setPlaying(false);
      setCompare(false);
    }
  }, [series]);

  const togglePlay = () => {
    if (!series) return;
    if (playing) return setPlaying(false);
    for (const x of series) if (x.layer.values) void getRaster(atlasUrl(x.layer.src)).catch(() => {});   // fetch ahead
    setCompare(false);
    if (series[series.length - 1]!.layer.id === layer?.id) onLayer(series[0]!.layer.id);
    setPlaying(true);
  };
  const toggleCompare = () => {
    if (!series) return;
    setPlaying(false);
    if (comparing) return setCompare(false);
    if (series[0]!.layer.id === layer?.id) onLayer(series[series.length - 1]!.layer.id);   // earliest vs latest
    setCompare(true);
  };
  const dragSplit = (e: React.PointerEvent<HTMLElement>) => {
    const rect = mapEl.current?.getBoundingClientRect();
    if (rect) setSplit(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
  };
  const keySplit = (e: React.KeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 10 : 2;
    const next = e.key === "ArrowLeft" ? split - step : e.key === "ArrowRight" ? split + step : e.key === "Home" ? 0 : e.key === "End" ? 100 : null;
    if (next === null) return;
    e.preventDefault();
    setSplit(Math.max(0, Math.min(100, next)));
  };

  useEffect(() => {
    engine?.setOpacity(opacity);
  }, [opacity, engine]);

  // the circle around the focus, over the data layer and under the labels
  useEffect(() => {
    if (!engine || !focus) return;
    engine.setFocus({ lat: focus.lat, lon: focus.lon, radiusM: RADIUS_M });
    return () => engine.setFocus(null);
  }, [focus, engine]);

  // the summary for the focus: read the layers it needs (each once per visit) and sum up the circle
  useEffect(() => {
    if (!focus) return;
    let live = true;
    setSummary({ state: "loading" });
    const wanted = atlas.layers.filter((l): l is typeof l & { id: SummaryLayerId } =>
      Boolean(l.values) && (SUMMARY_LAYERS as readonly string[]).includes(l.id));
    Promise.all(wanted.map((l) => getRaster(atlasUrl(l.src)).then((raster) => [l.id, { layer: l, raster }] as const)))
      .then((pairs) => {
        if (!live) return;
        const loaded: Partial<Record<SummaryLayerId, Loaded>> = {};
        for (const [id, x] of pairs) if (x.raster.width === w && x.raster.height === h) loaded[id] = x;
        const cells = cellsWithin(geo.cellAt(focus.lat, focus.lon), RADIUS_M, atlas.grid.pixel, w, h);
        setSummary({ state: "ready", data: summarise(loaded, cells) });
      })
      .catch((err: unknown) => live && setSummary({ state: "error", message: err instanceof Error ? err.message : String(err) }));
    return () => {
      live = false;
    };
  }, [focus, atlas.layers, atlas.grid.pixel, geo, h, w]);

  const goTo = (f: Focus, fly: boolean) => {
    setFocus(f);
    const m = engineNow.current;
    m?.closePopup();
    const wide = window.matchMedia("(min-width: 861px)").matches;
    if (m && fly) {
      m.flyTo({ lat: f.lat, lon: f.lon }, { minZoom: 13.5, padRight: wide ? 380 : 0,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1600 });
    }
    if (!wide) window.setTimeout(() => card.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };

  // other parts of the page can ask the map to show a place (e.g. the heat ranking)
  const goToNow = useRef(goTo);
  goToNow.current = goTo;
  useEffect(() => onFocusRequest((f) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    (ref && "current" in ref ? ref.current : null)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    goToNow.current(f, true);
  }), [ref]);

  const locate = () => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const near = nearest(places, coords.latitude, coords.longitude);
        goTo({ lat: coords.latitude, lon: coords.longitude, name: "Your location", context: near ? `near ${near.place.name}` : null }, true);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };

  // what is under the cursor (hover) or the finger (tap)
  useEffect(() => {
    const m = engine;
    if (!m) return;
    // the layer drawn at a grid column: when comparing, the side of the divider it is on
    const under = (col: number): Shown | null => {
      const two = sides.current, at = splitCol.current;
      return two && at !== null ? (col < at ? two.left : two.right) : shown.current;
    };
    const read = (lat: number, lon: number) => {
      const [row, col] = geo.cellAt(lat, lon);
      const inside = row >= 0 && col >= 0 && row < h && col < w;
      const s = under(col);
      const text = inside && s?.layer.values ? describe(s.layer, valueAt(s.raster, s.layer.values, row, col)) : null;
      const near = nearest(places, lat, lon);
      return { inside, text, layer: s?.layer ?? null, near: near ? `${near.km < 0.5 ? "in" : "near"} ${near.place.name}` : null };
    };
    const move = ({ lat, lon: lng }: { lat: number; lon: number }) => {
      const r = read(lat, lng);
      const label = sides.current && r.text && r.layer ? `${r.layer.label}: ${r.text}` : r.text;
      setCursor([label, r.near, formatLatLon(lat, lng)].filter(Boolean).join(" · "));
    };
    const out = () => setCursor(null);
    const click = ({ lat, lon: lng }: { lat: number; lon: number }) => {
      const r = read(lat, lng);
      const s = r.layer ? { layer: r.layer } : shown.current;
      if (!s) return;
      const box = document.createElement("div");      // text nodes only: names come from OpenStreetMap
      box.className = "readout";
      const head = document.createElement("span");
      head.className = "eyebrow";
      head.textContent = s.layer.label;
      const value = document.createElement("strong");
      const empty = s.layer.style.kind === "classes" ? "None of these classes here" : "No data here";
      value.textContent = !r.inside ? "Outside the study area" : r.text ?? empty;
      const where = document.createElement("span");
      where.className = "where";
      where.textContent = [r.near, formatLatLon(lat, lng)].filter(Boolean).join(" · ");
      box.append(head, value, where);
      if (summarisable && r.inside) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "btn readout-more";
        more.textContent = `Summarise this area (${RADIUS_M} m)`;
        more.onclick = () => {
          const n = nearest(places, lat, lng);
          goTo({ lat, lon: lng, name: null, context: n ? `${n.km < 0.5 ? "in" : "near"} ${n.place.name}` : null }, false);
        };
        box.append(more);
      }
      m.popup({ lat, lon: lng }, box);
    };
    return m.onPointer({ move, out, click });
  }, [engine, geo, places, h, w, summarisable]);

  const groups = [...new Set(atlas.layers.map((l) => l.group))];
  return (
    <section className="card mapcard" ref={ref} aria-label="Interactive map" id="map">
      {summarisable && (
        <PlaceSearch places={places} onPick={(f) => goTo(f, true)} onLocate={"geolocation" in navigator ? locate : undefined} locating={locating} />
      )}
      <div className="layers" role="radiogroup" aria-label="Map layer">
        {groups.map((g) => (
          <div className="layer-group" key={g}>
            <span className="eyebrow">{g}</span>
            {atlas.layers.filter((l) => l.group === g).map((l) => (
              <label className="layer" key={l.id}>
                <input type="radio" name="layer" value={l.id} checked={l.id === layer?.id} onChange={() => onLayer(l.id)} />
                {l.label}
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="mapcol">
        <div className="mapwrap">
          <div className="map" ref={mapEl} role="img"
            aria-label={before ? `Street map of Kampala comparing ${before.layer.label} (left) with ${layer?.label ?? ""} (right)` : `Street map of Kampala showing ${layer?.label ?? ""}`} />
          {before && (
            <div className="swipe" style={{ left: `${split}%` }}>
              <span className="swipe-tag left" aria-hidden="true">{before.year}</span>
              <span className="swipe-tag right" aria-hidden="true">{series?.find((x) => x.layer.id === layer?.id)?.year}</span>
              <div
                className="swipe-handle" role="slider" tabIndex={0}
                aria-label={`Divider: ${before.year} on the left, ${layer?.label ?? ""} on the right`}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)}
                aria-valuetext={`${Math.round(split)} % from the left`}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragSplit(e);
                }}
                onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && dragSplit(e)}
                onKeyDown={keySplit}
              >
                <span aria-hidden="true">‹ ›</span>
              </div>
            </div>
          )}
          {layer && (
            <div className="float legend">
              <span className="eyebrow" aria-live="polite"><Icon.layers size={13} /> {before ? `${before.year} | ${layer.label}` : layer.label}</span>
              <Legend layer={layer} />
              {series && (
                <div className="timebar">
                  <button type="button" className="iconbtn play" onClick={togglePlay} disabled={comparing}
                    aria-label={playing ? "Pause" : `Play through ${series.map((x) => x.year).join(", ")}`} title={playing ? "Pause" : "Play through the years"}>
                    {playing ? <Icon.pause /> : <Icon.play />}
                  </button>
                  <div className="years" role="group" aria-label="Year">
                    {series.map((x) => (
                      <button key={x.layer.id} type="button" aria-pressed={x.layer.id === layer.id}
                        disabled={comparing && x === first}
                        onClick={() => {
                          setPlaying(false);
                          onLayer(x.layer.id);
                        }}>
                        {x.year}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="btn compare" aria-pressed={comparing} onClick={toggleCompare}>
                    {comparing ? "Stop comparing" : `Compare with ${first?.year}`}
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="float opacity">
            <label className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">Opacity</span>
              <input type="range" min={0} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} aria-label="Layer opacity" />
            </label>
            <label className="toggle"><input type="checkbox" checked={relief} onChange={(e) => setRelief(e.target.checked)} /> Hill shading</label>
          </div>
          {status.state === "loading" && <div className="float map-status" role="status">Loading {layer?.label}…</div>}
          {status.state === "error" && <div className="float map-status error" role="alert">This layer could not be loaded ({status.message}).</div>}
          {cursor && <div className="cursor-read" role="status">{cursor}</div>}
          {basemapNote && (
            <div className="float basemap-note" role="status">
              Street map unavailable ({basemapNote.why}), so the layer is shown on a plain background. {basemapNote.hint}
            </div>
          )}
        </div>
        {focus && (
          <div className="place-card-wrap" ref={card}>
            <PlaceCard focus={focus} summary={summary} firstYear={atlas.years[0]} radiusM={RADIUS_M} onClose={() => setFocus(null)} />
          </div>
        )}
        <p className="caption">
          {layer?.caption}{" "}
          <span className="muted">
            {layer?.values ? "Tap or click the map to read the value at a spot. " : ""}
            Zoom with the buttons, Ctrl + scroll, or two fingers on a phone.
            {layer?.values && <> <a href={atlasUrl(layer.src)} download>Download this layer</a> (GeoTIFF, opens in QGIS).</>}
          </span>
        </p>
      </div>
    </section>
  );
});
