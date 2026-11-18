// Which building is under the cursor. deck.gl 9.4 cannot pick from layers while sun shadows are on, so
// the viewer finds it itself: walk down the cursor's line of sight from the tallest roof, a metre at a
// time, and stop at the first footprint it is inside of that reaches that height.
import type { Building } from "./types";

type Ring = [number, number][];

/** Is [x, y] inside the ring (even-odd rule)? */
export function inside([x, y]: [number, number], ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export interface BuildingIndex {
  cell: number;
  cells: Map<string, number[]>;
  buildings: Building[];
  maxHeight: number;
}

/** Bucket buildings by the grid cells (about 55 m) their bounding boxes touch. */
export function indexBuildings(buildings: Building[], cell = 0.0005): BuildingIndex {
  const cells = new Map<string, number[]>();
  let maxHeight = 0;
  buildings.forEach((b, i) => {
    maxHeight = Math.max(maxHeight, b.h);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of b.p) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
      for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
        const k = `${cx}:${cy}`;
        const list = cells.get(k);
        if (list) list.push(i);
        else cells.set(k, [i]);
      }
    }
  });
  return { cell, cells, buildings, maxHeight };
}

/** Index of the building hit by the line of sight, or -1. `unproject(z)` gives the [lon, lat] seen at height z m. */
export function pickBuilding(index: BuildingIndex, unproject: (z: number) => [number, number] | null): number {
  for (let z = Math.ceil(index.maxHeight); z >= 0; z -= 1) {
    const at = unproject(z);
    if (!at) continue;
    const list = index.cells.get(`${Math.floor(at[0] / index.cell)}:${Math.floor(at[1] / index.cell)}`);
    if (!list) continue;
    for (const i of list) {
      const b = index.buildings[i]!;
      if (b.h >= z && inside(at, b.p)) return i;
    }
  }
  return -1;
}
