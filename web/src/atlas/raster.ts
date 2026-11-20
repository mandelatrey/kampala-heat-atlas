// Map layers as data: read a GeoTIFF written by scripts/14_atlas.py, colour it, and read values from it.
import type { AtlasLayer, ClassStyle, RampStyle, ValueSpec } from "./types";

type Stored = Uint8Array | Int16Array | Uint16Array | Int32Array | Float32Array;

export interface Raster {
  width: number;
  height: number;
  /** Stored integers, row by row from the top (north) row. */
  data: Stored;
}

/** "#c23434" or "#c23" -> [r, g, b] */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * `n` colours spread evenly along `stops` with linear RGB interpolation: the same table matplotlib's
 * LinearSegmentedColormap.from_list(stops) makes, so the map matches the thesis figures.
 */
export function rampTable(stops: string[], n = 256): Uint8Array {
  const rgb = stops.map(hexToRgb);
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (rgb.length - 1);
    const k = Math.min(Math.floor(t), rgb.length - 2);
    const f = t - k;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(rgb[k]![c]! + (rgb[k + 1]![c]! - rgb[k]![c]!) * f);
  }
  return out;
}

/** The value stored at a cell, or null for nodata or outside the grid. */
export function valueAt(r: Raster, spec: ValueSpec, row: number, col: number): number | null {
  const i = Math.floor(row), j = Math.floor(col);
  if (i < 0 || j < 0 || i >= r.height || j >= r.width) return null;
  const s = r.data[i * r.width + j]!;
  if (s === spec.nodata || Number.isNaN(s)) return null;
  return s * spec.scale + spec.offset;
}

/** RGBA pixels for the whole grid, ready for a canvas. */
export function paint(r: Raster, spec: ValueSpec, style: ClassStyle | RampStyle): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(new ArrayBuffer(r.width * r.height * 4));
  const { data } = r;
  if (style.kind === "classes") {
    // stored class value -> colour (stored integers are the class values: scale 1, offset 0)
    const colours = new Map(style.classes.map((c) => [c.value, hexToRgb(c.color)] as const));
    for (let i = 0; i < data.length; i++) {
      const c = colours.get(data[i]!);
      if (!c) continue;
      px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255;
    }
    return px;
  }
  const lut = rampTable(style.colors);
  const n = lut.length / 3;
  const lo = style.min ?? 0, hi = style.max ?? 1;
  const hide = style.hide_below ?? -Infinity;
  for (let i = 0; i < data.length; i++) {
    const s = data[i]!;
    if (s === spec.nodata || Number.isNaN(s)) continue;
    const v = s * spec.scale + spec.offset;
    if (v < hide) continue;
    const k = Math.round(Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * (n - 1)) * 3;
    px[i * 4] = lut[k]!; px[i * 4 + 1] = lut[k + 1]!; px[i * 4 + 2] = lut[k + 2]!; px[i * 4 + 3] = 255;
  }
  return px;
}

/** A value in words for this layer, e.g. "+4.2 °C vs the city average" or "very high". */
export function describe(layer: AtlasLayer, value: number | null): string | null {
  if (value === null || !layer.values) return null;
  if (layer.style.kind === "classes") return layer.style.classes.find((c) => c.value === value)?.name ?? null;
  const spec = layer.values;
  const d = spec.decimals ?? 1;
  const rounded = Number(value.toFixed(d));
  const sign = spec.signed && rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const num = `${sign}${Math.abs(rounded).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  return (spec.readout ?? `{v} ${spec.unit ?? ""}`).replace("{v}", num).trim();
}

/** Decode a single-band GeoTIFF (geotiff.js is loaded only when a data layer is first needed). */
export async function decodeTiff(buffer: ArrayBuffer): Promise<Raster> {
  const { fromArrayBuffer } = await import("geotiff");
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const [band] = (await image.readRasters({ samples: [0] })) as unknown as Stored[];
  if (!band) throw new Error("no raster band");
  return { width: image.getWidth(), height: image.getHeight(), data: band };
}

export async function loadRaster(url: string): Promise<Raster> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return decodeTiff(await res.arrayBuffer());
}

const cache = new Map<string, Promise<Raster>>();

/** loadRaster, once per URL for the life of the page. */
export function getRaster(url: string): Promise<Raster> {
  let p = cache.get(url);
  if (!p) {
    p = loadRaster(url);
    p.catch(() => cache.delete(url));          // let a failed load be tried again
    cache.set(url, p);
  }
  return p;
}
