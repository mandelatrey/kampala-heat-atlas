import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre finds its worker next to its own file, which Vite moves; build the worker and say where it is
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { ImageSource, Map as MlMap, MapMouseEvent, Popup, StyleSpecification } from "maplibre-gl";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { useIsDark } from "../theme";
import { atlasUrl } from "./data";
import { formatLatLon, gridGeo } from "./geo";
import { PlaceCard, PlaceSearch, type Focus } from "./PlaceCard";
import { nearest, usePlaces, type Place } from "./places";
import { describe, getRaster, paint, valueAt, type Raster } from "./raster";
import { splitImage, yearSeries } from "./series";
import { cellsWithin, summarise, SUMMARY_LAYERS, type AreaSummary, type Loaded, type SummaryLayerId } from "./summary";
import type { Atlas, AtlasLayer } from "./types";

// Street map: OpenFreeMap's vector tiles (OpenStreetMap data, no key). The research layer goes in under the
// first label layer, so place and road names stay readable on top of it. MapLibre loads with the map, not the page.
const STYLE = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;
/** A plain background, used when the street map cannot load, so the research layer still shows. */
const BLANK = (dark: boolean): StyleSpecification => ({
  version: 8, sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": dark ? "#2a2c2b" : "#d4d5cf" } }],
});
const DATA = "atlas-data";
const RELIEF = "atlas-relief";
const FOCUS = "atlas-focus";            // the circle around a searched place or tapped spot
const RADIUS_M = 500;

/** A circle of radius r metres around a point, as GeoJSON (good to a metre at this size). */
function circle(lat: number, lon: number, r: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const dLat = r / 111320, dLon = r / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

type SummaryState = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: AreaSummary };

type MapLibre = typeof import("maplibre-gl");

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

/**
 * Where research layers go: just above the street map's last non-label layer, so roads and areas sit under the
 * data and every label sits on top (some styles put a few labels early; those end up under the data).
 */
function aboveBasemap(m: MlMap): string | undefined {
  const layers = m.getStyle().layers;
  let last = -1;
  layers.forEach((l, i) => {
    if (l.type !== "symbol" && !l.id.startsWith("atlas-")) last = i;
  });
  return layers.slice(last + 1).find((l) => !l.id.startsWith("atlas-"))?.id;
}

/** Labels that stay readable over a coloured layer: the dark style's grey labels get light text on a dark halo. */
function strengthenLabels(m: MlMap, dark: boolean) {
  if (!dark) return;
  for (const l of m.getStyle().layers) {
    if (l.type !== "symbol" || !m.getLayoutProperty(l.id, "text-field")) continue;
    m.setPaintProperty(l.id, "text-color", "#f1f2f4");
    m.setPaintProperty(l.id, "text-halo-color", "rgba(10, 11, 13, 0.9)");
    m.setPaintProperty(l.id, "text-halo-width", 1.6);
  }
}

/**
 * Put a picture in the data layer: swap the image in place when the layer exists (no flash between years),
 * otherwise add it under the focus circle and the labels.
 */
function showData(m: MlMap, corners: ImageSource["coordinates"], src: { image: ImageData } | { url: string }, opacity: number) {
  const existing = m.getSource(DATA) as ImageSource | undefined;
  if (existing) {
    existing.updateImage({ ...src, coordinates: corners });
    return;
  }
  m.addSource(DATA, { type: "image", coordinates: corners, ...("url" in src ? { url: src.url } : {}) });
  if ("image" in src) (m.getSource(DATA) as ImageSource).updateImage({ image: src.image });
  m.addLayer({
    id: DATA, type: "raster", source: DATA,
    paint: { "raster-opacity": opacity, "raster-resampling": "nearest", "raster-fade-duration": 0 },
  }, m.getLayer(`${FOCUS}-fill`) ? `${FOCUS}-fill` : aboveBasemap(m));
}

function removeLayer(m: MlMap, id: string) {
  if (!m.style) return;                        // the map is gone or between styles
  if (m.getLayer(id)) m.removeLayer(id);
  if (m.getSource(id)) m.removeSource(id);
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
  const [basemapNote, setBasemapNote] = useState<string | null>(null);   // why the street map is missing
  const blank = useRef(false);                                           // showing BLANK instead of the street map
  const [styleGen, setStyleGen] = useState(0);         // bumps on every style load: layers are re-added then
  const ready = styleGen > 0;
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ml = useRef<MapLibre | null>(null);
  const popup = useRef<Popup | null>(null);
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

  // the map, once
  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;
    let m: MlMap | null = null;
    let cancelled = false;
    let started = false;
    const fail = (why: string, err?: unknown) => {
      const detail = err instanceof Error ? err.message : err ? String(err) : "";
      console.error("map:", why, err);
      if (!cancelled) setStatus({ state: "error", message: detail ? `${why}: ${detail}` : why });
    };
    // no street map (blocked, offline, worker trouble): carry on with a plain background and say why
    const withoutStreets = (why: string, err?: unknown) => {
      if (cancelled || blank.current || !m) return;
      console.warn("map: street map unavailable:", why, err);
      blank.current = true;
      setBasemapNote(why);
      m.setStyle(BLANK(darkNow.current), { diff: false });
    };
    const slow = window.setTimeout(() => {
      if (!started) withoutStreets("it did not load within 15 s");
    }, 15000);
    import("maplibre-gl").then((lib) => {
      if (cancelled) return;
      try {
        lib.setWorkerUrl(mapWorkerUrl);
        const [[s, wst], [n, e]] = geo.bounds;
        const pad = 0.3 * Math.max(n - s, e - wst);
        m = new lib.Map({
          container: el, style: STYLE(darkNow.current),
          bounds: [[wst, s], [e, n]], fitBoundsOptions: { padding: 16 },
          maxBounds: [[wst - pad, s - pad], [e + pad, n + pad]], minZoom: 8, maxZoom: 17.5,
          dragRotate: false, pitchWithRotate: false, touchPitch: false,
          cooperativeGestures: true,       // page scroll stays page scroll: Ctrl + scroll, or two fingers on a phone
          attributionControl: { compact: true },
        });
      } catch (err) {
        return fail("the map could not start (it needs WebGL)", err);
      }
      const mm = m;
      mm.touchZoomRotate.disableRotation();
      mm.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
      mm.addControl(new lib.ScaleControl({ unit: "metric", maxWidth: 110 }), "top-left");
      mm.on("style.load", () => {
        started = true;
        strengthenLabels(mm, darkNow.current);
        setStyleGen((g) => g + 1);
      });
      mm.on("error", (ev) => {
        // before the street map has loaded, an error means it will not (worker, style or network)
        if (!started && !blank.current) withoutStreets(ev.error?.message ?? "it could not be fetched", ev.error);
        else console.warn("map:", ev.error?.message ?? ev);
      });
      ml.current = lib;
      map.current = mm;
    }, (err: unknown) => fail("the map code could not load", err));
    return () => {
      cancelled = true;
      window.clearTimeout(slow);
      m?.remove();
      map.current = null;
    };
  }, [geo]);

  // light or dark street map with the page
  useEffect(() => {
    if (darkNow.current === dark) return;
    darkNow.current = dark;
    map.current?.setStyle(blank.current ? BLANK(dark) : STYLE(dark), { diff: false });
  }, [dark]);

  // optional relief shading, under the data layer
  useEffect(() => {
    const m = map.current;
    if (!m || !styleGen || !relief) return;
    m.addSource(RELIEF, { type: "image", url: new URL(atlasUrl(atlas.base), location.href).href, coordinates: geo.corners });
    m.addLayer({ id: RELIEF, type: "raster", source: RELIEF, paint: { "raster-opacity": 0.4, "raster-fade-duration": 0 } },
      m.getLayer(DATA) ? DATA : aboveBasemap(m));
    return () => removeLayer(m, RELIEF);
  }, [relief, styleGen, atlas.base, geo]);

  // the selected layer (with the earliest year beside it when comparing): drawn from its data, or the older
  // ready-coloured image; swapped in place, so stepping through the years does not flash
  useEffect(() => {
    const m = map.current;
    if (!m || !styleGen || !layer) return;
    let live = true;
    shown.current = null;
    sides.current = null;
    popup.current?.remove();
    setStatus({ state: "loading" });
    if (!layer.values) {
      showData(m, geo.corners, { url: new URL(atlasUrl(layer.src), location.href).href }, opacityNow.current);
      setStatus({ state: "idle" });
      return () => {
        live = false;
      };
    }
    const wanted = before?.layer.values ? [before.layer, layer] : [layer];
    Promise.all(wanted.map((l) => getRaster(atlasUrl(l.src)).then((raster): Shown => ({ layer: l, raster, image: layerPixels(l, raster) }))))
      .then((drawn) => {
        if (!live || !m.style) return;
        const right = drawn[drawn.length - 1]!;
        shown.current = right;
        if (drawn.length === 2) {
          sides.current = { left: drawn[0]!, right };
          redraw.current();
        } else {
          showData(m, geo.corners, { image: right.image }, opacityNow.current);
        }
        setStatus({ state: "idle" });
      })
      .catch((err: unknown) => {
        if (!live) return;
        removeLayer(m, DATA);                    // do not leave the previous layer up under this one's name
        setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      live = false;
    };
  }, [layer, before?.layer, styleGen, geo]); // not on opacity (set below without redrawing); `before` by its layer

  // comparing: the earliest year left of the divider, the selected year right of it; redrawn as the divider
  // moves and as the map pans (the divider stays put on screen), at most once a frame
  const frame = useRef(0);
  const redraw = useRef(() => {});
  redraw.current = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const m = map.current, s = sides.current, el = mapEl.current;
      if (!m?.style || !s || !el) return;
      const { lng, lat } = m.unproject([(splitNow.current / 100) * el.clientWidth, el.clientHeight / 2]);
      const col = geo.cellAt(lat, lng)[1];
      splitCol.current = col;
      const { width, height } = s.right.image;
      const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
      splitImage(s.left.image.data, s.right.image.data, width, height, col, out);
      showData(m, geo.corners, { image: new ImageData(out, width, height) }, opacityNow.current);
    });
  };
  useEffect(() => {
    if (comparing) redraw.current();
    else splitCol.current = null;
  }, [split, comparing]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !comparing) return;
    const move = () => redraw.current();
    m.on("move", move);
    return () => {
      m.off("move", move);
    };
  }, [ready, comparing]);

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
    const m = map.current;
    if (m?.style && m.getLayer(DATA)) m.setPaintProperty(DATA, "raster-opacity", opacity);
  }, [opacity, status]);

  // the circle around the focus, over the data layer and under the labels
  useEffect(() => {
    const m = map.current;
    if (!m || !styleGen || !focus) return;
    m.addSource(FOCUS, { type: "geojson", data: circle(focus.lat, focus.lon, RADIUS_M) });
    const before = aboveBasemap(m);
    m.addLayer({ id: `${FOCUS}-fill`, type: "fill", source: FOCUS, paint: { "fill-color": "#ffffff", "fill-opacity": 0.12 } }, before);
    m.addLayer({ id: `${FOCUS}-line`, type: "line", source: FOCUS, paint: { "line-color": dark ? "#ffffff" : "#14161a", "line-width": 2.5, "line-dasharray": [2, 1.5] } }, before);
    return () => {
      if (!m.style) return;
      for (const id of [`${FOCUS}-line`, `${FOCUS}-fill`]) if (m.getLayer(id)) m.removeLayer(id);
      if (m.getSource(FOCUS)) m.removeSource(FOCUS);
    };
  }, [focus, styleGen, dark]);

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
    popup.current?.remove();
    const m = map.current;
    const wide = window.matchMedia("(min-width: 861px)").matches;
    if (m && fly) {
      m.flyTo({ center: [f.lon, f.lat], zoom: Math.max(m.getZoom(), 13.5), padding: { top: 0, bottom: 0, left: 0, right: wide ? 380 : 0 },
        essential: true, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1600 });
    }
    if (!wide) window.setTimeout(() => card.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };

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
    const m = map.current;
    const lib = ml.current;
    if (!m || !lib) return;
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
    const move = (e: MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
      const r = read(lat, lng);
      const label = sides.current && r.text && r.layer ? `${r.layer.label}: ${r.text}` : r.text;
      setCursor([label, r.near, formatLatLon(lat, lng)].filter(Boolean).join(" · "));
    };
    const out = () => setCursor(null);
    const click = (e: MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
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
      popup.current?.remove();
      popup.current = new lib.Popup({ maxWidth: "260px", focusAfterOpen: false }).setLngLat(e.lngLat).setDOMContent(box).addTo(m);
    };
    m.on("mousemove", move);
    m.on("mouseout", out);
    m.on("click", click);
    return () => {
      m.off("mousemove", move);
      m.off("mouseout", out);
      m.off("click", click);
    };
  }, [ready, geo, places, h, w, summarisable]);

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
              Street map unavailable ({basemapNote}), so the layer is shown on a plain background.{" "}
              {/worker/i.test(basemapNote)
                ? "MapLibre's helper script did not load; on the dev server, restart it with npm run dev -- --force."
                : "An ad or privacy blocker, or the network, may be stopping tiles.openfreemap.org."}
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
