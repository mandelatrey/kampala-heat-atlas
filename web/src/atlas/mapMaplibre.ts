import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre finds its worker next to its own file, which Vite moves; build the worker and say where it is
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import * as lib from "maplibre-gl";
import type { ImageSource, Map as MlMap, Popup, StyleSpecification } from "maplibre-gl";
import { circle } from "./geo";
import type { DataSource, EngineOptions, LatLon, MapEngine } from "./mapEngine";

// Street map: OpenFreeMap's vector tiles (OpenStreetMap data, no key). The research layer goes in under the
// first label layer, so place and road names stay readable on top of it.
const STYLE = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;
/** A plain background, used when the street map cannot load, so the research layer still shows. */
const BLANK = (dark: boolean): StyleSpecification => ({
  version: 8, sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": dark ? "#2a2c2b" : "#d4d5cf" } }],
});
const DATA = "atlas-data";
const RELIEF = "atlas-relief";
const FOCUS = "atlas-focus";
const HINT_BLOCKED = "An ad or privacy blocker, or the network, may be stopping tiles.openfreemap.org.";
const HINT_WORKER = "MapLibre's helper script did not load; on the dev server, restart it with npm run dev -- --force.";

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

function drop(m: MlMap, ...ids: string[]) {
  for (const id of ids) if (m.getLayer(id)) m.removeLayer(id);
}

/** MapLibre over OpenFreeMap. Throws when WebGL 2 will not start. */
export function createMaplibre(el: HTMLElement, opts: EngineOptions): MapEngine {
  lib.setWorkerUrl(mapWorkerUrl);
  const [[s, w], [n, e]] = opts.bounds;
  const pad = 0.3 * Math.max(n - s, e - w);
  let dark = opts.dark;
  const m = new lib.Map({
    container: el, style: STYLE(dark),
    bounds: [[w, s], [e, n]], fitBoundsOptions: { padding: 16 },
    maxBounds: [[w - pad, s - pad], [e + pad, n + pad]], minZoom: 8, maxZoom: 17.5,
    dragRotate: false, pitchWithRotate: false, touchPitch: false,
    cooperativeGestures: true,       // page scroll stays page scroll: Ctrl + scroll, or two fingers on a phone
    attributionControl: { compact: true },
  });
  m.touchZoomRotate.disableRotation();
  m.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
  m.addControl(new lib.ScaleControl({ unit: "metric", maxWidth: 110 }), "top-left");

  // what should be on the map; re-added after every style load (a style change drops sources and layers)
  let data: DataSource | null = null;
  let opacity = opts.opacity;
  let relief: string | null = null;
  let focus: { lat: number; lon: number; radiusM: number } | null = null;
  let loaded = false;
  let started = false;                 // the street map has loaded once
  let blank = false;                   // showing BLANK instead of the street map
  let popup: Popup | null = null;
  let removed = false;

  const applyRelief = () => {
    if (!loaded) return;
    drop(m, RELIEF);
    if (m.getSource(RELIEF)) m.removeSource(RELIEF);
    if (!relief) return;
    m.addSource(RELIEF, { type: "image", url: relief, coordinates: opts.corners });
    m.addLayer({ id: RELIEF, type: "raster", source: RELIEF, paint: { "raster-opacity": 0.4, "raster-fade-duration": 0 } },
      m.getLayer(DATA) ? DATA : m.getLayer(`${FOCUS}-fill`) ? `${FOCUS}-fill` : aboveBasemap(m));
  };
  const applyData = () => {
    if (!loaded) return;
    const existing = m.getSource(DATA) as ImageSource | undefined;
    if (!data) {
      drop(m, DATA);
      if (existing) m.removeSource(DATA);
      return;
    }
    if (existing) {
      existing.updateImage({ ...data, coordinates: opts.corners });   // swap in place: no flash between years
      return;
    }
    m.addSource(DATA, { type: "image", coordinates: opts.corners, ...("url" in data ? { url: data.url } : {}) });
    if ("image" in data) (m.getSource(DATA) as ImageSource).updateImage({ image: data.image });
    m.addLayer({
      id: DATA, type: "raster", source: DATA,
      paint: { "raster-opacity": opacity, "raster-resampling": "nearest", "raster-fade-duration": 0 },
    }, m.getLayer(`${FOCUS}-fill`) ? `${FOCUS}-fill` : aboveBasemap(m));
  };
  const applyFocus = () => {
    if (!loaded) return;
    drop(m, `${FOCUS}-line`, `${FOCUS}-fill`);
    if (m.getSource(FOCUS)) m.removeSource(FOCUS);
    if (!focus) return;
    m.addSource(FOCUS, { type: "geojson", data: circle(focus.lat, focus.lon, focus.radiusM) });
    const before = aboveBasemap(m);
    m.addLayer({ id: `${FOCUS}-fill`, type: "fill", source: FOCUS, paint: { "fill-color": "#ffffff", "fill-opacity": 0.12 } }, before);
    m.addLayer({ id: `${FOCUS}-line`, type: "line", source: FOCUS, paint: { "line-color": dark ? "#ffffff" : "#14161a", "line-width": 2.5, "line-dasharray": [2, 1.5] } }, before);
  };
  const setStyle = (style: string | StyleSpecification) => {
    loaded = false;
    m.setStyle(style, { diff: false });
  };

  // no street map (blocked, offline, worker trouble): carry on with a plain background and say why
  const withoutStreets = (why: string) => {
    if (removed || blank) return;
    blank = true;
    opts.onBasemapMissing(why, /worker/i.test(why) ? HINT_WORKER : HINT_BLOCKED);
    setStyle(BLANK(dark));
  };
  const slow = window.setTimeout(() => {
    if (!started) withoutStreets("it did not load within 15 s");
  }, 15000);
  m.on("style.load", () => {
    started = true;
    loaded = true;
    strengthenLabels(m, dark);
    applyRelief();
    applyData();
    applyFocus();
  });
  m.on("error", (ev) => {
    // before the street map has loaded, an error means it will not (worker, style or network)
    if (!started && !blank) {
      console.warn("map: street map unavailable:", ev.error);
      withoutStreets(ev.error?.message ?? "it could not be fetched");
    } else console.warn("map:", ev.error?.message ?? ev);
  });

  return {
    kind: "maplibre",
    setData(src) {
      data = src;
      applyData();
    },
    setOpacity(o) {
      opacity = o;
      if (loaded && m.getLayer(DATA)) m.setPaintProperty(DATA, "raster-opacity", o);
    },
    setRelief(url) {
      relief = url;
      applyRelief();
    },
    setFocus(f) {
      focus = f;
      applyFocus();
    },
    setDark(d) {
      if (d === dark) return;
      dark = d;
      setStyle(blank ? BLANK(d) : STYLE(d));
    },
    flyTo(to, o) {
      m.flyTo({ center: [to.lon, to.lat], zoom: Math.max(m.getZoom(), o.minZoom), padding: { top: 0, bottom: 0, left: 0, right: o.padRight },
        essential: true, duration: o.duration });
    },
    unproject(x, y) {
      const { lng, lat } = m.unproject([x, y]);
      return { lat, lon: lng };
    },
    onMove(fn) {
      m.on("move", fn);
      return () => void m.off("move", fn);
    },
    onPointer({ move, out, click }) {
      const mv = (e: lib.MapMouseEvent) => move({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      const ck = (e: lib.MapMouseEvent) => click({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      m.on("mousemove", mv);
      m.on("mouseout", out);
      m.on("click", ck);
      return () => {
        m.off("mousemove", mv);
        m.off("mouseout", out);
        m.off("click", ck);
      };
    },
    popup(at: LatLon, content) {
      popup?.remove();
      popup = new lib.Popup({ maxWidth: "260px", focusAfterOpen: false }).setLngLat([at.lon, at.lat]).setDOMContent(content).addTo(m);
    },
    closePopup() {
      popup?.remove();
      popup = null;
    },
    remove() {
      removed = true;
      window.clearTimeout(slow);
      m.remove();
    },
  };
}
