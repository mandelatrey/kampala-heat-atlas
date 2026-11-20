// Shape of docs/atlas/atlas.json, written by scripts/14_atlas.py (layer encoding: src/kampala/weblayers.py).
// Paths are relative to docs/atlas/. Numbers and charts are in stats.json (see stats.ts).

/** Categorical layer: stored value -> colour and name. 0 (or any value not listed) is drawn empty. */
export interface ClassStyle {
  kind: "classes";
  classes: { value: number; color: string; name: string }[];
}

/** Continuous layer: `colors` spread evenly from min to max; values outside are clamped. */
export interface RampStyle {
  kind: "ramp";
  colors: string[];
  /** Missing for the older PNG layers, whose colours are already baked in. */
  min?: number;
  max?: number;
  /** Legend text under the low end, the middle and the high end. */
  labels: [low: string, mid: string, high: string];
  /** Values under this are drawn transparent (they stay in the data). */
  hide_below?: number;
}

/** How stored integers become values: value = stored * scale + offset; `nodata` means no value. */
export interface ValueSpec {
  scale: number;
  offset: number;
  nodata: number;
  unit?: string;
  decimals?: number;
  /** Show a + on positive values. */
  signed?: boolean;
  /** How to word a value; {v} is the formatted number, e.g. "{v} °C vs the city average". */
  readout?: string;
}

export interface AtlasLayer {
  id: string;
  /** Panel group, e.g. "Heat", "Growth". */
  group: string;
  label: string;
  caption: string;
  style: ClassStyle | RampStyle;
  /**
   * With `values`: a GeoTIFF on the shared grid that the page colours itself (and can read values from).
   * Without: a ready-coloured PNG on the same grid (atlas.json files written before the data export).
   */
  src: string;
  values?: ValueSpec;
}

export interface Atlas {
  /** Grid size in pixels, [height, width]. */
  size: [number, number];
  /** The three epochs, e.g. [2017, 2021, 2025]. */
  years: [number, number, number];
  /** Relief shading on the same grid, an optional layer under the data. */
  base: string;
  /** Where the grid sits on the Earth (UTM). */
  grid: import("./geo").Grid;
  layers: AtlasLayer[];
  /** Animations from the older atlas.json; the wind GIF is shown only until stats.json has the wind table. */
  anims?: Partial<Record<"wind", string>>;
}

// ---- atlas.json as written before the data export (layers as coloured PNGs); data.ts converts it

export interface OldLayer {
  id: string;
  group: string;
  label: string;
  caption: string;
  src: string;
  kind: "classes" | "ramp";
  legend: [string, string][] | [string, string, string, string];
}

export interface OldAtlas extends Omit<Atlas, "layers"> {
  layers: OldLayer[];
  ramps: Record<string, string>;
}
