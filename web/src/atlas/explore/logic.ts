// The hands-on parts of the growth, heat and settlements modules: pure functions over the atlas layers and stats,
// so they can be tested without a browser.
import type { Place } from "../places";
import type { Raster } from "../raster";
import type { ValueSpec } from "../types";

// ---- growth

export const DIRECTIONS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Compass sector (0 = north, clockwise in eighths) of a grid cell seen from a centre cell (rows grow southwards). */
export function sectorOf(row: number, col: number, centre: [number, number]): number {
  const deg = (Math.atan2(col + 0.5 - centre[1], centre[0] - (row + 0.5)) * 180) / Math.PI;   // 0 = north, 90 = east
  return Math.round(((deg + 360) % 360) / 45) % 8;
}

/** km² of new building in each compass direction from the centre: cells whose growth class is one of `newClasses`. */
export function growthByDirection(r: Raster, spec: ValueSpec, centre: [number, number], pixelM: number, newClasses: number[]): number[] {
  const out = new Array<number>(8).fill(0);
  const cellKm2 = (pixelM * pixelM) / 1e6;
  for (let row = 0; row < r.height; row++) {
    for (let col = 0; col < r.width; col++) {
      const s = r.data[row * r.width + col]!;
      if (s === spec.nodata) continue;
      if (newClasses.includes(s * spec.scale + spec.offset)) out[sectorOf(row, col, centre)]! += cellKm2;
    }
  }
  return out;
}

/** The two directions with the most new building, biggest first. */
export function topDirections(km2: number[]): [Direction, Direction] {
  const order = km2.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  return [DIRECTIONS[order[0]![1]]!, DIRECTIONS[order[1]![1]]!];
}

/**
 * The growth layer as it stood at a step: step 0 shows what was built by the first year, step 1 adds what was new by
 * the second, step 2 everything. `colors` are the class colours in class order (1, 2, 3). RGBA pixels.
 */
export function growthPicture(r: Raster, spec: ValueSpec, step: number, colors: [number, number, number][]): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(new ArrayBuffer(r.width * r.height * 4));
  for (let i = 0; i < r.data.length; i++) {
    const s = r.data[i]!;
    if (s === spec.nodata) continue;
    const cls = Math.round(s * spec.scale + spec.offset);
    if (cls < 1 || cls > step + 1) continue;
    const c = colors[cls - 1];
    if (!c) continue;
    px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255;
  }
  return px;
}

// ---- heat ranking

export interface Ranked {
  place: Place;
  /** Mean surface heat vs the city land mean, °C, within the circle. */
  anom: number;
  /** Share of the circle that is built up. */
  built: number;
}

/**
 * Named places ranked by surface heat around them, hottest first: the mean of `heat` over the cells in each place's
 * circle, for places whose circle is at least `minBuilt` built up (so a forest village does not count as a cool
 * neighbourhood). `cellsOf` gives a place's cells; `isBuilt` says whether a cell is built up.
 */
export function rankPlaces(places: Place[], cellsOf: (p: Place) => number[], heat: (cell: number) => number | null,
  isBuilt: (cell: number) => boolean, minBuilt = 0.5): Ranked[] {
  const out: Ranked[] = [];
  for (const place of places) {
    if (place.kind === "city" || place.kind === "peak" || place.kind === "island") continue;
    const cells = cellsOf(place);
    if (!cells.length) continue;
    let sum = 0, n = 0, built = 0;
    for (const c of cells) {
      if (isBuilt(c)) built++;
      const v = heat(c);
      if (v !== null) { sum += v; n++; }
    }
    if (n < cells.length / 2 || built / cells.length < minBuilt) continue;
    out.push({ place, anom: sum / n, built: built / cells.length });
  }
  return out.sort((a, b) => b.anom - a.anom);
}

/** Distance in km between two points (flat-earth, fine at city scale). */
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dy = (a.lat - b.lat) * 111.32, dx = (a.lon - b.lon) * 111.32 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** The first `count` entries, skipping any within `minKm` of one already taken (neighbouring villages share one hotspot). */
export function spreadOut(ranked: Ranked[], count: number, minKm = 1.5): Ranked[] {
  const out: Ranked[] = [];
  for (const r of ranked) {
    if (out.length >= count) break;
    if (out.every((o) => km(o.place, r.place) >= minKm)) out.push(r);
  }
  return out;
}

/** Share (0-100) of ranked places cooler than this one. */
export function hotterThan(ranked: Ranked[], r: Ranked): number {
  return ranked.length > 1 ? (100 * ranked.filter((x) => x.anom < r.anom).length) / (ranked.length - 1) : 0;
}

// ---- Local Climate Zones in plain words

/** Plain descriptions of the Local Climate Zones the atlas uses (Stewart and Oke 2012), keyed by the zone's code. */
export const LCZ_WORDS: Record<string, { name: string; looks: string }> = {
  "2": { name: "Packed mid-rise", looks: "Buildings of three to nine storeys packed close together, with little greenery: the city centre." },
  "3": { name: "Packed low houses", looks: "Houses and shops of one to three storeys packed close together, with paved or bare ground and few trees." },
  "5": { name: "Spaced mid-rise", looks: "Buildings of three to nine storeys with space, grass or trees between them: flats, offices, institutions." },
  "6": { name: "Houses with gardens", looks: "Houses of one to three storeys with gardens and trees between them." },
  "8": { name: "Big low buildings", looks: "Large low buildings with paved yards: warehouses, factories, sheds and shopping centres." },
  "9": { name: "Scattered houses", looks: "Houses spread out across open or farmed land, mostly at the edge of the city." },
  A: { name: "Dense trees", looks: "Forest and thick tree cover: wooded hills, forest reserves, big tree-covered compounds." },
  B: { name: "Scattered trees", looks: "Trees with open ground between them: wooded gardens and farmland with trees." },
  C: { name: "Bush and scrub", looks: "Bushes and shrubs with few trees." },
  D: { name: "Grass and crops", looks: "Grass, gardens and crops: farmland, playing fields, open land." },
};

/** "3 compact low-rise" -> "3"; "A dense trees" -> "A". */
export const lczCode = (zoneName: string) => zoneName.split(" ")[0] ?? "";

// ---- packing in (settlements)

/** The slider's stops, from open land to packed low houses: Local Climate Zone codes. */
export const PACKING_STOPS = ["D", "9", "6", "3"] as const;

/** Settlement trajectories (m3_thermal_trajectories.csv) in plain words. */
export const TRAJECTORY_WORDS: Record<string, { name: string; story: string }> = {
  "always formal dense": { name: "Already built up in 2017", story: "Dense blocks of larger buildings that were already there in 2017." },
  "became informal-type": { name: "Packed in since 2017", story: "Blocks that filled up with small, closely packed buildings between 2017 and 2025." },
  "always informal-type": { name: "Small and packed all along", story: "Blocks of small, closely packed buildings that were already like that in 2017." },
};
