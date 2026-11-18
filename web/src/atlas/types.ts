// Shape of docs/atlas/atlas.json, written by scripts/14_atlas.py. Paths are relative to docs/atlas/.

/** Headline numbers, already formatted by Python (e.g. "1,516", "+1.0", "82–83"). */
export type NumberKey =
  | "built0" | "built2" | "builtpct" | "hot0" | "hot2" | "inf" | "formal" | "became" | "formalchg"
  | "cool10" | "treecool" | "treepeople" | "newcanopy" | "vh_people" | "vh_km2"
  | "gwp" | "twh" | "roofs" | "yield_" | "r_min" | "r_max" | "agree";

export type RampKey = "diverging" | "sequential";

interface LayerBase {
  id: string;
  /** Panel group, e.g. "Heat", "Growth". */
  group: string;
  label: string;
  caption: string;
  /** Transparent PNG on the shared grid, e.g. "layers/thermal-2025.png". */
  src: string;
}

/** Categorical layer: one swatch per class, [colour, name]. */
export interface ClassLayer extends LayerBase {
  kind: "classes";
  legend: [color: string, name: string][];
}

/** Continuous layer: [low label, middle label, high label, ramp]. */
export interface RampLayer extends LayerBase {
  kind: "ramp";
  legend: [low: string, mid: string, high: string, ramp: RampKey];
}

export type AtlasLayer = ClassLayer | RampLayer;

export type ChartKey = "lcz" | "traj" | "class" | "solar" | "trees" | "cube";
export type AnimKey = "wind" | "cube";

export interface Atlas {
  /** Grid size in pixels, [height, width]; the map uses it as image bounds. */
  size: [number, number];
  /** The three epochs, e.g. [2017, 2021, 2025]. */
  years: [number, number, number];
  numbers: Record<NumberKey, string>;
  /** CSS gradients for the ramp legends. */
  ramps: Record<RampKey, string>;
  /** Hillshade under every layer. */
  base: string;
  /** Where the grid sits on the Earth (older atlas.json files lack it; the map then has no names or coordinates). */
  grid?: import("./geo").Grid;
  layers: AtlasLayer[];
  charts: Record<ChartKey, string>;
  anims: Record<AnimKey, string>;
}
