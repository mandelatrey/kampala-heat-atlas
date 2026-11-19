import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre finds its worker next to its own file, which Vite moves; build the worker and say where it is
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Map as MlMap, MapMouseEvent, Popup, StyleSpecification } from "maplibre-gl";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { useIsDark } from "../theme";
import { atlasUrl } from "./data";
import { formatLatLon, gridGeo } from "./geo";
import { nearest, usePlaces, type Place } from "./places";
import { describe, getRaster, paint, valueAt, type Raster } from "./raster";
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

// each data layer is painted once per visit and kept as an image URL
const painted = new Map<string, Promise<string>>();

function layerImage(layer: AtlasLayer, r: Raster): Promise<string> {
  let p = painted.get(layer.id);
  if (!p) {
    p = (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = r.width;
      canvas.height = r.height;
      const ctx = canvas.getContext("2d");
      if (!ctx || !layer.values) throw new Error("no canvas");
      ctx.putImageData(new ImageData(paint(r, layer.values, layer.style), r.width, r.height), 0, 0);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok));
      if (!blob) throw new Error("could not draw the layer");
      return URL.createObjectURL(blob);
    })();
    p.catch(() => painted.delete(layer.id));
    painted.set(layer.id, p);
  }
  return p;
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
  const shown = useRef<{ layer: AtlasLayer; raster: Raster } | null>(null);   // the data under the cursor
  const dark = useIsDark();
  const darkNow = useRef(dark);
  const [h, w] = atlas.size;
  const layer = atlas.layers.find((l) => l.id === layerId) ?? atlas.layers[0];
  const geo = useMemo(() => gridGeo(atlas.grid, h, w), [atlas.grid, h, w]);
  const placesLoad = usePlaces();
  const places: Place[] = placesLoad.state === "ready" ? placesLoad.data.places : [];

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

  // the selected layer: drawn from its data, or the older ready-coloured image
  useEffect(() => {
    const m = map.current;
    if (!m || !styleGen || !layer) return;
    let live = true;
    shown.current = null;
    popup.current?.remove();
    const place = (url: string) => {
      if (!live || !m.style) return;
      m.addSource(DATA, { type: "image", url, coordinates: geo.corners });
      m.addLayer({
        id: DATA, type: "raster", source: DATA,
        paint: { "raster-opacity": opacity, "raster-resampling": "nearest", "raster-fade-duration": 0 },
      }, aboveBasemap(m));
    };
    setStatus({ state: "loading" });
    if (layer.values) {
      getRaster(atlasUrl(layer.src))
        .then(async (raster) => {
          const url = await layerImage(layer, raster);
          if (!live) return;
          place(url);
          shown.current = { layer, raster };
          setStatus({ state: "idle" });
        })
        .catch((err: unknown) => live && setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) }));
    } else {
      place(new URL(atlasUrl(layer.src), location.href).href);
      setStatus({ state: "idle" });
    }
    return () => {
      live = false;
      removeLayer(m, DATA);
    };
  }, [layer, styleGen, geo]); // not on opacity: the effect below changes it without redrawing

  useEffect(() => {
    const m = map.current;
    if (m?.style && m.getLayer(DATA)) m.setPaintProperty(DATA, "raster-opacity", opacity);
  }, [opacity, status]);

  // what is under the cursor (hover) or the finger (tap)
  useEffect(() => {
    const m = map.current;
    const lib = ml.current;
    if (!m || !lib) return;
    const read = (lat: number, lon: number) => {
      const [row, col] = geo.cellAt(lat, lon);
      const inside = row >= 0 && col >= 0 && row < h && col < w;
      const s = shown.current;
      const text = inside && s?.layer.values ? describe(s.layer, valueAt(s.raster, s.layer.values, row, col)) : null;
      const near = nearest(places, lat, lon);
      return { inside, text, near: near ? `${near.km < 0.5 ? "in" : "near"} ${near.place.name}` : null };
    };
    const move = (e: MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
      const r = read(lat, lng);
      setCursor([r.text, r.near, formatLatLon(lat, lng)].filter(Boolean).join(" · "));
    };
    const out = () => setCursor(null);
    const click = (e: MapMouseEvent) => {
      const s = shown.current;
      if (!s) return;
      const { lat, lng } = e.lngLat;
      const r = read(lat, lng);
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
  }, [ready, geo, places, h, w]);

  const groups = [...new Set(atlas.layers.map((l) => l.group))];
  return (
    <section className="card mapcard" ref={ref} aria-label="Interactive map" id="map">
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
          <div className="map" ref={mapEl} role="img" aria-label={`Street map of Kampala showing ${layer?.label ?? ""}`} />
          {layer && (
            <div className="float legend" aria-live="polite">
              <span className="eyebrow"><Icon.layers size={13} /> {layer.label}</span>
              <Legend layer={layer} />
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
