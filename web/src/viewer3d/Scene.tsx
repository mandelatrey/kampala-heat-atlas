import { AmbientLight, FlyToInterpolator, LightingEffect, _SunLight as SunLight, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { BitmapLayer, LineLayer, PolygonLayer, ScatterplotLayer, SolidPolygonLayer } from "@deck.gl/layers";
import DeckGL from "@deck.gl/react";
import { useMemo, useState } from "react";
import { rampColour, type ColourKey } from "./colours";
import { indexBuildings, pickBuilding } from "./pick";
import type { Arrow, Building, DistrictData, DistrictMeta } from "./types";

export interface SceneProps {
  meta: DistrictMeta;
  data: DistrictData;
  colour: ColourKey;
  /** Sun time, ms since the epoch. */
  time: number;
  wind: boolean;
  shade: boolean;
  /** Changes when the camera should fly back to the district's starting view. */
  viewKey: number;
  onError: (message: string) => void;
}

const AMBIENT = new AmbientLight({ color: [255, 255, 255], intensity: 0.55 });
const MATERIAL = { ambient: 0.35, diffuse: 0.7, shininess: 8, specularColor: [40, 40, 40] as [number, number, number] };

export function startView(meta: DistrictMeta): MapViewState {
  return {
    longitude: meta.centre[0], latitude: meta.centre[1], zoom: 15.1, pitch: 55, bearing: -20,
    transitionDuration: 900, transitionInterpolator: new FlyToInterpolator(),
  } as MapViewState;
}

interface Hover { index: number; x: number; y: number }

function Tooltip({ b, x, y }: { b: Building; x: number; y: number }) {
  return (
    <div className="scene-tip" style={{ left: x, top: y }}>
      <b>{b.h.toFixed(1)} m tall</b>
      <span>Roof sun {b.kwh === null ? "–" : `${b.kwh.toFixed(0)} kWh/m²/yr`}</span>
      <span>Shading loss {b.loss === null ? "–" : `${b.loss.toFixed(0)} %`}</span>
      <span>Wall penalty {b.pen.toFixed(0)} kWh/m²/yr</span>
    </div>
  );
}

/** The deck.gl scene: ground, optional shade-hours image, extruded buildings, breeze arrows, sun and shadows. */
export function Scene({ meta, data, colour, time, wind, shade, viewKey, onError }: SceneProps) {
  const [hover, setHover] = useState<Hover | null>(null);
  const index = useMemo(() => indexBuildings(data.buildings), [data]);
  const onHover = (info: PickingInfo) => {
    const vp = info.viewport;
    const i = vp && info.x >= 0 ? pickBuilding(index, (z) => vp.unproject([info.x, info.y], { targetZ: z }).slice(0, 2) as [number, number]) : -1;
    setHover(i >= 0 ? { index: i, x: info.x, y: info.y } : null);
  };
  // a new object each time viewKey or the district changes makes deck.gl fly there
  const initialViewState = useMemo(() => startView(meta), [meta, viewKey]);
  const effects = useMemo(() => [
    new LightingEffect({ ambient: AMBIENT, sun: new SunLight({ timestamp: time, color: [255, 244, 225], intensity: 2.2, _shadow: true }) }),
  ], [time]);

  const layers = [
    new SolidPolygonLayer<{ p: [number, number][] }>({
      id: "ground", data: [{ p: meta.ground }], getPolygon: (o) => o.p, getFillColor: [228, 226, 218],
    }),
    shade && new BitmapLayer({ id: "shade", image: data.shade_png, bounds: meta.bounds, opacity: 0.85 }),
    new PolygonLayer<Building>({
      // not pickable: deck.gl 9.4 cannot pick while sun shadows are on, so hovering uses pick.ts
      id: "buildings", data: data.buildings, extruded: true, wireframe: false, pickable: false,
      getPolygon: (o) => o.p, getElevation: (o) => o.h, getFillColor: (o) => rampColour(colour, o[colour]),
      material: MATERIAL, updateTriggers: { getFillColor: colour },
      highlightedObjectIndex: hover?.index ?? -1, highlightColor: [255, 255, 255, 110],
    }),
    wind && new LineLayer<Arrow>({
      id: "wind", data: data.arrows, getSourcePosition: (a) => [a[0], a[1], 4], getTargetPosition: (a) => [a[2], a[3], 4],
      getColor: (a) => [20, 20, 25, 90 + (140 * Math.min(a[4], 1.2)) / 1.2], getWidth: 2,
    }),
    wind && new ScatterplotLayer<Arrow>({
      id: "heads", data: data.arrows, getPosition: (a) => [a[2], a[3], 4], getRadius: 2.2, getFillColor: [20, 20, 25, 200],
    }),
  ].filter(Boolean);

  return (
    <>
      <DeckGL
        initialViewState={initialViewState}
        controller={{ touchRotate: true, inertia: true }}
        layers={layers}
        effects={effects}
        onHover={onHover}
        onError={(e) => onError(e.message)}
        getCursor={({ isDragging }) => (isDragging ? "grabbing" : hover ? "pointer" : "grab")}
      />
      {hover && data.buildings[hover.index] && <Tooltip b={data.buildings[hover.index]!} x={hover.x} y={hover.y} />}
    </>
  );
}
