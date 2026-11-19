// Layers that exist for several years ("thermal-2017", "thermal-2021", "thermal-2025"), for the map's year
// controls, and the before/after picture the compare divider shows.
import type { AtlasLayer } from "./types";

export interface YearLayer {
  year: number;
  layer: AtlasLayer;
}

const YEARED = /^(.+)-(\d{4})$/;

/** The other years of the selected layer, oldest first, or null when it has no other year. */
export function yearSeries(layers: AtlasLayer[], id: string): YearLayer[] | null {
  const m = YEARED.exec(id);
  if (!m) return null;
  const base = m[1];
  const series = layers.flatMap((layer) => {
    const x = YEARED.exec(layer.id);
    return x && x[1] === base ? [{ year: Number(x[2]), layer }] : [];
  });
  series.sort((a, b) => a.year - b.year);
  return series.length >= 2 ? series : null;
}

/**
 * Two pictures of the same grid side by side: columns before `col` from `left`, the rest from `right` (RGBA,
 * `width` pixels a row). Writes into `out` and returns it. The grid is north-up, so a vertical line on screen is a column.
 */
export function splitImage(left: Uint8ClampedArray, right: Uint8ClampedArray, width: number, height: number, col: number,
  out: Uint8ClampedArray = new Uint8ClampedArray(width * height * 4)): Uint8ClampedArray {
  const c = Math.max(0, Math.min(width, Math.round(col))) * 4;
  const row = width * 4;
  for (let r = 0; r < height; r++) {
    const a = r * row;
    if (c > 0) out.set(left.subarray(a, a + c), a);
    if (c < row) out.set(right.subarray(a + c, a + row), a + c);
  }
  return out;
}
