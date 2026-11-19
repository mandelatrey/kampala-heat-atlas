import { describe, expect, it } from "vitest";
import { splitImage, yearSeries } from "./series";
import type { AtlasLayer } from "./types";

// Made-up layers; only the ids matter here.
const L = (id: string) => ({ id, group: "", label: id, caption: "", src: "", style: { kind: "classes", classes: [] } }) as unknown as AtlasLayer;
const layers = ["thermal-2025", "thermal-2021", "thermal-2017", "lst-2025", "lst-change", "landcover-2025", "landcover-2017", "growth"].map(L);

describe("year series", () => {
  it("finds a layer's other years, oldest first", () => {
    expect(yearSeries(layers, "thermal-2021")?.map((x) => [x.year, x.layer.id])).toEqual([
      [2017, "thermal-2017"], [2021, "thermal-2021"], [2025, "thermal-2025"],
    ]);
    expect(yearSeries(layers, "landcover-2025")?.map((x) => x.year)).toEqual([2017, 2025]);
  });
  it("is null for a layer with one year or none", () => {
    expect(yearSeries(layers, "lst-2025")).toBeNull();
    expect(yearSeries(layers, "lst-change")).toBeNull();
    expect(yearSeries(layers, "growth")).toBeNull();
  });
});

describe("split picture", () => {
  // 3 x 2 pixels: left image all 1s, right all 2s
  const left = new Uint8ClampedArray(3 * 2 * 4).fill(1);
  const right = new Uint8ClampedArray(3 * 2 * 4).fill(2);
  const cols = (out: Uint8ClampedArray) => [0, 1, 2].map((c) => out[c * 4]);
  it("takes columns left of the line from the left picture", () => {
    const out = splitImage(left, right, 3, 2, 1);
    expect(cols(out)).toEqual([1, 2, 2]);
    expect(Array.from(out.subarray(12, 24)).filter((v) => v === 1)).toHaveLength(4);   // second row too
  });
  it("clamps the line to the picture", () => {
    expect(cols(splitImage(left, right, 3, 2, -5))).toEqual([2, 2, 2]);
    expect(cols(splitImage(left, right, 3, 2, 99))).toEqual([1, 1, 1]);
    expect(cols(splitImage(left, right, 3, 2, 1.6))).toEqual([1, 1, 2]);
  });
});
