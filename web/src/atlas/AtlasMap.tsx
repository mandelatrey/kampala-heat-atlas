import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { forwardRef, useEffect, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { atlasUrl } from "./data";
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
          <label className="float opacity">
            <span className="eyebrow">Opacity</span>
            <input type="range" min={0} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} aria-label="Layer opacity" />
          </label>
        </div>
        <p className="caption">{layer?.caption} <span className="muted">Drag to pan; zoom with the buttons, a pinch, or Ctrl + scroll.</span></p>
      </div>
    </section>
  );
});
