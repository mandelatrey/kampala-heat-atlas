import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { atlasUrl } from "./data";
import { formatLatLon, gridProjection, niceScale } from "./geo";
import { chooseLabels, nearest, usePlaces, type Place } from "./places";
import type { Atlas, AtlasLayer } from "./types";

function Legend({ layer, ramps }: { layer: AtlasLayer; ramps: Atlas["ramps"] }) {
  if (layer.kind === "classes") {
    return (
      <div className="legend-classes">
        {layer.legend.map(([color, name]) => <span key={name}><i style={{ background: color }} />{name}</span>)}
      </div>
    );
  }
  const [lo, mid, hi, ramp] = layer.legend;
  return (
    <div className="legend-ramp">
      <div className="bar" style={{ background: ramps[ramp] }} />
      <div className="ends"><span>{lo}</span><span>{mid}</span><span>{hi}</span></div>
    </div>
  );
}

interface Props {
  atlas: Atlas;
  layerId: string;
  onLayer: (id: string) => void;
}

/** The atlas map card: layer list, Leaflet map over the hillshade, floating legend, opacity, caption. */
export const AtlasMap = forwardRef<HTMLElement, Props>(function AtlasMap({ atlas, layerId, onLayer }, ref) {
  const [opacity, setOpacity] = useState(0.85);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlay = useRef<L.ImageOverlay | null>(null);
  const [h, w] = atlas.size;
  const layer = atlas.layers.find((l) => l.id === layerId) ?? atlas.layers[0];
  const proj = useMemo(() => (atlas.grid ? gridProjection(atlas.grid, h) : null), [atlas.grid, h]);
  const placesLoad = usePlaces();
  const places: Place[] = placesLoad.state === "ready" ? placesLoad.data.places : [];
  const [names, setNames] = useState(true);
  const [zoom, setZoom] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  // the map and its base image, once
  useEffect(() => {
    if (!mapEl.current) return;
    const bounds: L.LatLngBoundsExpression = [[0, 0], [h, w]];
    const m = L.map(mapEl.current, {
      crs: L.CRS.Simple, minZoom: -3, maxZoom: 3, zoomSnap: 0.25, attributionControl: false, zoomControl: false,
      scrollWheelZoom: false,          // page scroll stays page scroll; zoom with buttons, pinch or ctrl+wheel
    });
    L.control.zoom({ position: "topright" }).addTo(m);
    L.imageOverlay(atlasUrl(atlas.base), bounds).addTo(m);
    m.fitBounds(bounds);
    m.createPane("names").style.zIndex = "450";        // above the layers, below the controls
    m.getPane("names")!.style.pointerEvents = "none";
    setZoom(m.getZoom());
    m.on("zoomend", () => setZoom(m.getZoom()));
    const el = mapEl.current;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) m.scrollWheelZoom.enable();
      else m.scrollWheelZoom.disable();
    };
    el.addEventListener("wheel", wheel, { capture: true });
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(el);
    map.current = m;
    return () => {
      el.removeEventListener("wheel", wheel, { capture: true });
      resize.disconnect();
      m.remove();
      map.current = null;
      overlay.current = null;
    };
  }, [atlas.base, h, w]);

  // the selected layer
  useEffect(() => {
    const m = map.current;
    if (!m || !layer) return;
    const o = L.imageOverlay(atlasUrl(layer.src), [[0, 0], [h, w]]).addTo(m);
    overlay.current = o;
    return () => {
      o.remove();
      if (overlay.current === o) overlay.current = null;
    };
  }, [layer, h, w]);

  useEffect(() => {
    overlay.current?.setOpacity(opacity);
  }, [opacity, layer]);

  // place names: the ones that fit at this zoom, redrawn after every pan and zoom
  useEffect(() => {
    const m = map.current;
    if (!m || !proj || !names || places.length === 0) return;
    const group = L.layerGroup().addTo(m);
    const draw = () => {
      group.clearLayers();
      const size = m.getSize();
      const pos = new Map(places.map((p) => [p, proj.toMap(p.lat, p.lon)] as const));
      const shown = chooseLabels(places, m.getZoom(), (p) => {
        const [y, x] = pos.get(p)!;
        const pt = m.latLngToContainerPoint([y, x]);
        return [pt.x, pt.y];
      }, { w: size.x, h: size.y });
      for (const p of shown) {
        const label = document.createElement("span");
        label.textContent = p.name;                     // names come from OpenStreetMap: text, never HTML
        L.marker(pos.get(p)!, {
          pane: "names", interactive: false, keyboard: false,
          icon: L.divIcon({ className: `place-label r${p.rank}`, html: label, iconSize: [0, 0] }),
        }).addTo(group);
      }
    };
    draw();
    m.on("moveend zoomend resize", draw);
    return () => {
      m.off("moveend zoomend resize", draw);
      group.remove();
    };
  }, [proj, names, places]);

  // where the cursor is: coordinates and the nearest named place
  useEffect(() => {
    const m = map.current;
    if (!m || !proj) return;
    const move = (e: L.LeafletMouseEvent) => {
      const { lat: my, lng: mx } = e.latlng;
      if (my < 0 || my > h || mx < 0 || mx > w) return setCursor(null);
      const [lat, lon] = proj.toLatLon(my, mx);
      const near = nearest(places, lat, lon);
      setCursor(`${formatLatLon(lat, lon)}${near ? ` · ${near.km < 0.5 ? "in" : "near"} ${near.place.name}` : ""}`);
    };
    const out = () => setCursor(null);
    m.on("mousemove", move);
    m.on("mouseout", out);
    return () => {
      m.off("mousemove", move);
      m.off("mouseout", out);
    };
  }, [proj, places, h, w]);

  // scale bar: CRS.Simple shows 2^zoom screen px per grid cell
  const scaleBar = proj && zoom !== null ? (() => {
    const mpp = proj.metresPerUnit / 2 ** zoom;
    const s = niceScale(110 * mpp);
    return { ...s, px: s.metres / mpp };
  })() : null;

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
          <div className="map" ref={mapEl} role="img" aria-label={`Map: ${layer?.label ?? ""} over terrain`} />
          {layer && (
            <div className="float legend" aria-live="polite">
              <span className="eyebrow"><Icon.layers size={13} /> {layer.label}</span>
              <Legend layer={layer} ramps={atlas.ramps} />
            </div>
          )}
          <div className="float opacity">
            <label className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">Opacity</span>
              <input type="range" min={0} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} aria-label="Layer opacity" />
            </label>
            {places.length > 0 && (
              <label className="names-toggle"><input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} /> Place names</label>
            )}
          </div>
          {scaleBar && (
            <div className="scalebar" aria-label={`Scale: the bar is ${scaleBar.label}`}>
              <span className="scalebar-bar" style={{ width: scaleBar.px }} />
              <span>{scaleBar.label}</span>
            </div>
          )}
          {cursor && <div className="cursor-read" role="status">{cursor}</div>}
        </div>
        <p className="caption">
          {layer?.caption} <span className="muted">Drag to pan; zoom with the buttons, a pinch, or Ctrl + scroll.</span>
          {places.length > 0 && placesLoad.state === "ready" && <span className="muted"> Place names {placesLoad.data.source}.</span>}
        </p>
      </div>
    </section>
  );
});
