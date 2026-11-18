import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { atlasUrl } from "./data";
import type { Atlas, AtlasLayer } from "./types";

function Legend({ layer, ramps }: { layer: AtlasLayer; ramps: Atlas["ramps"] }) {
  if (layer.kind === "classes") {
    return (
      <>
        {layer.legend.map(([color, name]) => (
          <span className="sw" key={name}><i style={{ background: color }} />{name}</span>
        ))}
      </>
    );
  }
  const [lo, mid, hi, ramp] = layer.legend;
  return (
    <>
      <div className="ramp"><span>{lo}</span><div className="bar" style={{ background: ramps[ramp] }} /><span>{hi}</span></div>
      <span className="coords">{mid}</span>
    </>
  );
}

/** Leaflet map of the atlas layers over the hillshade, with the layer panel, legend and caption. */
export function AtlasMap({ atlas }: { atlas: Atlas }) {
  const first = atlas.layers[0];
  const [layerId, setLayerId] = useState(first?.id ?? "");
  const [opacity, setOpacity] = useState(0.85);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlay = useRef<L.ImageOverlay | null>(null);
  const [h, w] = atlas.size;
  const layer = atlas.layers.find((l) => l.id === layerId) ?? first;

  // the map and its base image, once
  useEffect(() => {
    if (!mapEl.current) return;
    const bounds: L.LatLngBoundsExpression = [[0, 0], [h, w]];
    const m = L.map(mapEl.current, { crs: L.CRS.Simple, minZoom: -3, maxZoom: 3, zoomSnap: 0.25, attributionControl: false });
    L.imageOverlay(atlasUrl(atlas.base), bounds).addTo(m);
    m.fitBounds(bounds);
    map.current = m;
    return () => {
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
    <div className="atlas" aria-label="Interactive map">
      <div className="panel">
        {groups.map((g) => (
          <div className="group" key={g} role="radiogroup" aria-label={g}>
            <span className="eyebrow">{g}</span>
            {atlas.layers.filter((l) => l.group === g).map((l) => (
              <label className="layer" key={l.id}>
                <input type="radio" name="layer" value={l.id} checked={l.id === layer?.id} onChange={() => setLayerId(l.id)} />{" "}
                {l.label}
              </label>
            ))}
          </div>
        ))}
        <div className="ctrl">
          <label htmlFor="opacity">Layer opacity</label>
          <input
            type="range" id="opacity" min={0} max={100} value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
          />
        </div>
      </div>
      <div className="mapcol">
        <div className="legend" aria-live="polite">{layer && <Legend layer={layer} ramps={atlas.ramps} />}</div>
        <div className="map" ref={mapEl} role="img" aria-label="Map of the selected layer over terrain" />
        <div className="caption">{layer?.caption}</div>
      </div>
    </div>
  );
}
