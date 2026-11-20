import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe as group, expect, it } from "vitest";
import { decodeTiff, describe, hexToRgb, paint, rampTable, valueAt, type Raster } from "./raster";
import type { AtlasLayer, ClassStyle, RampStyle, ValueSpec } from "./types";

// testdata/ holds two tiny layers written by src/kampala/weblayers.py, the module scripts/14_atlas.py uses:
//   ramp:    [[-1.25, 0, 2.5, nan], [8, -8, 12, 0.05], [1, 2, 3, masked]], int16 in steps of 0.05 °C
//   classes: [[0, 1, 2, 3], [3, 2, 1, 0], [1, 1, 1, 1]], uint8
// Remake with ramp_layer / class_layer on those arrays (EPSG:32636, 30 m) if the encoding changes.
const DIR = resolve(import.meta.dirname, "testdata");
const meta = JSON.parse(readFileSync(resolve(DIR, "layers.json"), "utf-8")) as Record<"ramp" | "classes", Pick<AtlasLayer, "src" | "style" | "values">>;
const load = (name: string) => {
  const b = readFileSync(resolve(DIR, `${name}.tif`));
  return decodeTiff(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
const layer = (k: "ramp" | "classes"): AtlasLayer => ({ id: k, group: "", label: k, caption: "", ...meta[k] });

group("GeoTIFF layers written by Python", () => {
  it("decode to the stored values", async () => {
    const r = await load("ramp");
    const spec = meta.ramp.values!;
    expect([r.width, r.height]).toEqual([4, 3]);
    expect(valueAt(r, spec, 0, 0)).toBeCloseTo(-1.25, 6);
    expect(valueAt(r, spec, 0, 2)).toBeCloseTo(2.5, 6);
    expect(valueAt(r, spec, 1, 2)).toBeCloseTo(12, 6);
    expect(valueAt(r, spec, 1, 3)).toBeCloseTo(0.05, 6);
    expect(valueAt(r, spec, 0, 3)).toBeNull();            // NaN
    expect(valueAt(r, spec, 2, 3)).toBeNull();            // masked (water)
    expect(valueAt(r, spec, 5, 0)).toBeNull();            // off the grid
  });

  it("read classes, with 0 as empty", async () => {
    const r = await load("classes");
    const spec = meta.classes.values!;
    expect(valueAt(r, spec, 0, 0)).toBeNull();
    expect(valueAt(r, spec, 0, 3)).toBe(3);
    expect(describe(layer("classes"), valueAt(r, spec, 1, 1))).toBe("b");
  });

  it("word values the way the layer says", async () => {
    const r = await load("ramp");
    const l = layer("ramp");
    expect(describe(l, valueAt(r, l.values!, 0, 2))).toBe("+2.5 °C vs the city average");
    expect(describe(l, valueAt(r, l.values!, 0, 0))).toBe("−1.3 °C vs the city average");
    expect(describe(l, valueAt(r, l.values!, 0, 1))).toBe("0.0 °C vs the city average");
    expect(describe(l, null)).toBeNull();
  });
});

group("colouring", () => {
  it("spreads ramp stops evenly, like matplotlib's from_list", () => {
    const t = rampTable(["#0000ff", "#ffffff", "#ff0000"], 5);
    expect([...t.slice(0, 3)]).toEqual([0, 0, 255]);
    expect([...t.slice(6, 9)]).toEqual([255, 255, 255]);
    expect([...t.slice(12, 15)]).toEqual([255, 0, 0]);
    expect([...t.slice(3, 6)]).toEqual([128, 128, 255]);
  });

  it("paints classes and leaves empty cells transparent", () => {
    const r: Raster = { width: 3, height: 1, data: new Uint8Array([0, 1, 2]) };
    const style: ClassStyle = { kind: "classes", classes: [{ value: 1, color: "#ff0000", name: "a" }, { value: 2, color: "#00ff00", name: "b" }] };
    const px = paint(r, { scale: 1, offset: 0, nodata: 0 }, style);
    expect([...px]).toEqual([0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it("clamps ramps, skips nodata and hides values under hide_below", () => {
    const spec: ValueSpec = { scale: 0.5, offset: 0, nodata: -32768 };
    const style: RampStyle = { kind: "ramp", colors: ["#000000", "#ffffff"], min: 0, max: 10, labels: ["", "", ""], hide_below: 1 };
    const r: Raster = { width: 4, height: 1, data: new Int16Array([-32768, 1, 40, 10]) };   // nodata, 0.5, 20, 5
    const px = paint(r, spec, style);
    expect(px[3]).toBe(0);                                  // nodata
    expect(px[7]).toBe(0);                                  // 0.5 < hide_below
    expect([...px.slice(8, 12)]).toEqual([255, 255, 255, 255]);   // 20 clamps to the top colour
    expect([...px.slice(12, 16)]).toEqual([128, 128, 128, 255]);  // 5 is half way
  });

  it("parses short and long hex colours", () => {
    expect(hexToRgb("#c23434")).toEqual([194, 52, 52]);
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
  });
});
