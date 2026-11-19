// "What is it like here?": the atlas layers summarised around a point (a searched place or a tapped spot).
// Pure functions over the decoded layers (raster.ts); the card (PlaceCard.tsx) words the result.
import type { Raster } from "./raster";
import type { AtlasLayer, ClassStyle } from "./types";

/** The layers the summary reads, by atlas.json id. */
export const SUMMARY_LAYERS = ["lst-2025", "lst-change", "thermal-2025", "landcover-2025", "growth", "trees", "solar", "informal-2025"] as const;
export type SummaryLayerId = (typeof SUMMARY_LAYERS)[number];

export interface Loaded {
  layer: AtlasLayer;
  raster: Raster;
}

export interface AreaSummary {
  /** Grid cells inside the circle. */
  cells: number;
  heat?: {
    /** Mean surface heat vs the city land mean, °C. */
    anom: number;
    /** Share (0-100) of all mapped land cells cooler than this mean. */
    rank: number;
    /** Share (0-1) of the area in the hottest thermal class. */
    hotShare?: number;
  };
  /** Mean change in relative surface heat since the first epoch, °C. */
  change?: number;
  ground?: {
    built: number;
    trees: number;
    water: number;
    /** Share (0-1) of the built-up land here that was built after the first epoch; null with no built land. */
    newBuilt: number | null;
  };
  trees?: {
    /** Cells that have any planting-priority class (open, plantable ground). */
    plantable: number;
    /** Share (0-1) of those that are high or very high priority. */
    highShare: number;
    /** The highest class present, e.g. "very high". */
    top: string | null;
  };
  solar?: {
    /** Mean rooftop generation over the blocks with roofs, GWh per km² a year. */
    mean: number;
    /** Share (0-100) of roofed blocks in the atlas area with less. */
    rank: number;
  };
  /** Share (0-1) of the area with informal-type (small, packed, low) housing. */
  informal?: number;
}

/** Grid cell indices within `radiusM` of a point given as a fractional [row, col]. */
export function cellsWithin(rc: [number, number], radiusM: number, pixelM: number, width: number, height: number): number[] {
  const [r0, c0] = rc;
  const R = radiusM / pixelM;
  const out: number[] = [];
  for (let r = Math.max(0, Math.floor(r0 - R)); r <= Math.min(height - 1, Math.ceil(r0 + R)); r++) {
    for (let c = Math.max(0, Math.floor(c0 - R)); c <= Math.min(width - 1, Math.ceil(c0 + R)); c++) {
      if (Math.hypot(r + 0.5 - r0, c + 0.5 - c0) <= R) out.push(r * width + c);
    }
  }
  return out;
}

const valueAtIndex = (l: Loaded, i: number): number | null => {
  const s = l.raster.data[i]!;
  const v = l.layer.values;
  if (!v || s === v.nodata || Number.isNaN(s)) return null;
  return s * v.scale + v.offset;
};

/** Class values whose names match. */
function classValues(layer: AtlasLayer, match: (name: string) => boolean): Set<number> {
  const s = layer.style as ClassStyle;
  return new Set(s.kind === "classes" ? s.classes.filter((c) => match(c.name)).map((c) => c.value) : []);
}

const sortedCache = new WeakMap<Raster, Float64Array>();

/** All valid values of a layer, sorted (once per raster), optionally only those at or above `min`. */
function sortedValues(l: Loaded, min = -Infinity): Float64Array {
  const key = l.raster;
  let all = sortedCache.get(key);
  if (!all) {
    const vals: number[] = [];
    for (let i = 0; i < l.raster.data.length; i++) {
      const v = valueAtIndex(l, i);
      if (v !== null) vals.push(v);
    }
    all = Float64Array.from(vals).sort();
    sortedCache.set(key, all);
  }
  if (min === -Infinity) return all;
  let lo = 0;
  while (lo < all.length && all[lo]! < min) lo++;
  return all.subarray(lo);
}

/** Share (0-100) of the sorted values below v. */
export function rankIn(sorted: Float64Array, v: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length ? (100 * lo) / sorted.length : 0;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Summarise the loaded layers over the given cells. Parts whose layer is missing (or has no data here) are left out. */
export function summarise(layers: Partial<Record<SummaryLayerId, Loaded>>, cells: number[]): AreaSummary {
  const out: AreaSummary = { cells: cells.length };
  const vals = (l: Loaded) => cells.map((i) => valueAtIndex(l, i)).filter((v): v is number => v !== null);
  const share = (l: Loaded, set: Set<number>, of = cells.length) =>
    of ? cells.filter((i) => set.has(l.raster.data[i]!)).length / of : 0;

  const lst = layers["lst-2025"];
  if (lst) {
    const m = mean(vals(lst));
    if (m !== null) {
      out.heat = { anom: m, rank: rankIn(sortedValues(lst), m) };
      const th = layers["thermal-2025"];
      if (th) out.heat.hotShare = share(th, classValues(th.layer, (n) => n === "hot"));
    }
  }
  const ch = layers["lst-change"];
  if (ch) {
    const m = mean(vals(ch));
    if (m !== null) out.change = m;
  }
  const lc = layers["landcover-2025"];
  if (lc) {
    const built = classValues(lc.layer, (n) => n.startsWith("built"));
    const g = layers.growth;
    let newBuilt: number | null = null;
    if (g) {
      const all = classValues(g.layer, () => true);
      const fresh = classValues(g.layer, (n) => n.startsWith("new"));
      const builtCells = cells.filter((i) => all.has(g.raster.data[i]!)).length;
      newBuilt = builtCells ? cells.filter((i) => fresh.has(g.raster.data[i]!)).length / builtCells : null;
    }
    out.ground = {
      built: share(lc, built), trees: share(lc, classValues(lc.layer, (n) => n === "tree cover")),
      water: share(lc, classValues(lc.layer, (n) => n === "water")), newBuilt,
    };
  }
  const tr = layers.trees;
  if (tr && tr.layer.style.kind === "classes") {
    const classes = tr.layer.style.classes;
    const plantable = cells.filter((i) => classes.some((c) => c.value === tr.raster.data[i])).length;
    const high = classValues(tr.layer, (n) => n === "high" || n === "very high");
    const present = classes.filter((c) => cells.some((i) => tr.raster.data[i] === c.value));
    out.trees = {
      plantable, highShare: plantable ? cells.filter((i) => high.has(tr.raster.data[i]!)).length / plantable : 0,
      top: present.length ? present[present.length - 1]!.name : null,
    };
  }
  const so = layers.solar;
  if (so && so.layer.style.kind === "ramp") {
    const floor = so.layer.style.hide_below ?? 0;
    const roofed = vals(so).filter((v) => v >= floor);
    const m = mean(roofed);
    if (m !== null) out.solar = { mean: m, rank: rankIn(sortedValues(so, floor), m) };
  }
  const inf = layers["informal-2025"];
  if (inf) out.informal = share(inf, classValues(inf.layer, () => true));
  return out;
}

export interface SummaryLine {
  topic: "heat" | "change" | "ground" | "trees" | "solar" | "housing";
  title: string;
  text: string;
  /** Colour role of the topic's main fact. */
  tone?: "hot" | "cool" | "neutral";
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const deg = (v: number) => `${v > 0.05 ? "+" : v < -0.05 ? "−" : ""}${Math.abs(v).toFixed(1)} °C`;

/** The summary in plain words, most important first. `firstYear` is the earliest epoch (e.g. 2017). */
export function summaryLines(s: AreaSummary, firstYear: number): SummaryLine[] {
  const out: SummaryLine[] = [];
  if (s.heat) {
    const r = Math.round(s.heat.rank);
    const lead = r >= 50 ? `Hotter than ${r}% of places in the atlas area.` : `Cooler than ${100 - r}% of places in the atlas area.`;
    const hot = s.heat.hotShare !== undefined && s.heat.hotShare >= 0.1 ? ` ${pct(s.heat.hotShare)} of it is in the hottest class.` : "";
    out.push({
      topic: "heat", title: "Heat", tone: s.heat.anom >= 1 ? "hot" : s.heat.anom <= -1 ? "cool" : "neutral",
      text: `${lead} In the dry season, ground and roofs here run ${deg(s.heat.anom)} compared with the city average.${hot}`,
    });
  }
  if (s.change !== undefined) {
    const c = s.change;
    out.push({
      topic: "change", title: `Since ${firstYear}`, tone: c >= 0.3 ? "hot" : c <= -0.3 ? "cool" : "neutral",
      text: Math.abs(c) < 0.3 ? `About the same heat relative to the city as in ${firstYear}.`
        : `${c > 0 ? "Warmed" : "Cooled"} ${Math.abs(c).toFixed(1)} °C relative to the rest of the city.`,
    });
  }
  if (s.ground) {
    const g = s.ground;
    const fresh = g.newBuilt === null || g.built < 0.05 ? ""
      : g.newBuilt < 0.01 ? ` Almost none of the built-up land here is new since ${firstYear}.`
      : ` ${pct(g.newBuilt)} of the built-up land here is new since ${firstYear}.`;
    const water = g.water >= 0.1 ? `, water ${pct(g.water)}` : "";
    out.push({ topic: "ground", title: "Ground cover", text: `Built-up ${pct(g.built)}, trees ${pct(g.trees)}${water}.${fresh}` });
  }
  if (s.trees) {
    const t = s.trees;
    out.push({
      topic: "trees", title: "Tree planting", tone: t.highShare >= 0.3 && t.plantable / s.cells >= 0.05 ? "cool" : "neutral",
      text: t.plantable === 0 ? "No open ground to plant on within this circle."
        : t.plantable / s.cells < 0.05 ? `Almost no open ground to plant on here; what little there is is ${t.top ?? "low"} priority for new trees.`
        : t.highShare >= 0.05 ? `Open ground covers ${pct(t.plantable / s.cells)} of this circle, and ${pct(t.highShare)} of it is high or very-high priority for new trees (where heat, people and space meet).`
        : `Open ground covers ${pct(t.plantable / s.cells)} of this circle; it is ${t.top ?? "low"} priority for new trees.`,
    });
  }
  if (s.solar) {
    out.push({
      topic: "solar", title: "Rooftop solar",
      text: `Roofs could generate about ${s.solar.mean.toFixed(0)} GWh per km² a year, more than ${Math.round(s.solar.rank)}% of built-up blocks in the atlas area.`,
    });
  }
  if (s.informal !== undefined && s.informal >= 0.1) {
    out.push({
      topic: "housing", title: "Housing", tone: "hot",
      text: `${pct(s.informal)} is small, tightly packed low-rise housing, the type of block that runs hottest and warmed fastest.`,
    });
  }
  return out;
}
