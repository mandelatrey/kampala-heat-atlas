import { describe, expect, it } from "vitest";
import { placeContext, searchPlaces, type Place } from "./places";
import type { Raster } from "./raster";
import { cellsWithin, rankIn, summarise, summaryLines, type Loaded } from "./summary";
import type { AtlasLayer } from "./types";

// A made-up 4 x 4 grid; the "area" is its top-left 2 x 2 cells (indices 0, 1, 4, 5).
const W = 4, H = 4;
const AREA = [0, 1, 4, 5];
const ramp = (id: string, vals: number[], extra: Partial<AtlasLayer["style"]> = {}): Loaded => ({
  layer: { id, group: "", label: id, caption: "", src: "", values: { scale: 0.5, offset: 0, nodata: -32768 },
    style: { kind: "ramp", colors: ["#000000", "#ffffff"], min: -8, max: 8, labels: ["", "", ""], ...extra } as AtlasLayer["style"] },
  raster: { width: W, height: H, data: new Int16Array(vals.map((v) => (Number.isNaN(v) ? -32768 : v / 0.5))) } as Raster,
});
const classes = (id: string, names: string[], vals: number[]): Loaded => ({
  layer: { id, group: "", label: id, caption: "", src: "", values: { scale: 1, offset: 0, nodata: 0 },
    style: { kind: "classes", classes: names.map((name, i) => ({ value: i + 1, color: "#000000", name })) } },
  raster: { width: W, height: H, data: new Uint8Array(vals) } as Raster,
});

describe("area summary", () => {
  it("finds the cells within a radius", () => {
    expect(cellsWithin([1, 1], 30, 30, W, H).sort((a, b) => a - b)).toEqual(AREA);
    expect(cellsWithin([-10, -10], 30, 30, W, H)).toEqual([]);
  });

  it("ranks a value among all the layer's values", () => {
    expect(rankIn(Float64Array.from([1, 2, 3, 4]), 3)).toBe(50);
    expect(rankIn(Float64Array.from([1, 2, 3, 4]), 9)).toBe(100);
  });

  it("sums up heat, change, ground cover, trees, solar and housing", () => {
    const s = summarise({
      "lst-2025": ramp("lst-2025", [6, 5, 0, 0, 5, 4, -1, -2, 0, 0, NaN, -3, 1, 1, 1, 1]),
      "lst-change": ramp("lst-change", [1, 1, 0, 0, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      "thermal-2025": classes("thermal-2025", ["very cool", "cool", "moderate", "warm", "hot"], [5, 5, 3, 3, 5, 4, 2, 2, 3, 3, 0, 1, 3, 3, 3, 3]),
      "landcover-2025": classes("landcover-2025", ["built dense", "built sparse", "tree cover", "grass / cropland", "bare soil", "wetland", "water"],
        [1, 1, 3, 3, 2, 3, 3, 3, 4, 4, 7, 7, 4, 4, 4, 4]),
      growth: classes("growth", ["built by 2017", "new 2017–2021", "new 2021–2025"], [1, 2, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      trees: classes("trees", ["low", "medium", "high", "very high"], [0, 0, 1, 1, 4, 3, 1, 1, 0, 0, 0, 0, 2, 2, 2, 2]),
      solar: ramp("solar", [40, 20, 0, 0, 0, 0, 0, 0, 10, 10, 0, 0, 30, 30, 0, 0], { hide_below: 0.5 }),
      "informal-2025": classes("informal-2025", ["informal-type morphology"], [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    }, AREA);
    expect(s.cells).toBe(4);
    expect(s.heat?.anom).toBeCloseTo(5);
    expect(s.heat?.rank).toBeCloseTo((100 * 12) / 15);     // 12 of the 15 valid cells are below 5
    expect(s.heat?.hotShare).toBeCloseTo(0.75);
    expect(s.change).toBeCloseTo(0.75);
    expect(s.ground).toEqual({ built: 0.75, trees: 0.25, water: 0, newBuilt: 2 / 3 });
    expect(s.trees).toEqual({ plantable: 2, highShare: 1, top: "very high" });
    expect(s.solar?.mean).toBeCloseTo(30);                  // only roofed blocks (>= 0.5) count
    expect(s.solar?.rank).toBeCloseTo(50);                  // 10, 10, 20 of the 6 roofed blocks are below 30
    expect(s.informal).toBeCloseTo(0.5);

    const lines = summaryLines(s, 2017);
    expect(lines.map((l) => l.topic)).toEqual(["heat", "change", "ground", "trees", "solar", "housing"]);
    expect(lines[0]!.text).toMatch(/^Hotter than 80% of places in the atlas area\. .* \+5\.0 °C compared with the city average\. 75% of it is in the hottest class\./);
    expect(lines[1]!.text).toBe("Warmed 0.8 °C relative to the rest of the city.");
    expect(lines[2]!.text).toBe("Built-up 75%, trees 25%. 67% of the built-up land here is new since 2017.");
    expect(lines[3]!.text).toMatch(/^Open ground covers 50% of this circle, and 100% of it is high or very-high priority/);
  });

  it("leaves out what it cannot say", () => {
    const s = summarise({ "lst-2025": ramp("lst-2025", new Array(16).fill(NaN)) }, AREA);
    expect(s.heat).toBeUndefined();
    expect(summaryLines(s, 2017)).toEqual([]);
    const cool = summaryLines({ cells: 4, heat: { anom: -2, rank: 10 }, change: 0.1 }, 2017);
    expect(cool[0]!.text).toMatch(/^Cooler than 90%/);
    expect(cool[1]!.text).toBe("About the same heat relative to the city as in 2017.");
    expect(summaryLines({ cells: 4, change: -0.62 }, 2017)[0]!.text).toBe("Cooled 0.6 °C relative to the rest of the city.");
    expect(summaryLines({ cells: 4, ground: { built: 0.99, trees: 0, water: 0, newBuilt: 0.004 } }, 2017)[0]!.text)
      .toBe("Built-up 99%, trees 0%. Almost none of the built-up land here is new since 2017.");
  });
});

describe("place search", () => {
  const P = (name: string, kind: string, rank: number, lat: number, lon: number): Place => ({ name, kind, rank, lat, lon });
  const places = [
    P("Kampala", "city", 1, 0.316, 32.582), P("Kawempe", "suburb", 3, 0.375, 32.558), P("Kisenyi", "village", 4, 0.312, 32.570),
    P("Kisenyi", "village", 4, 0.37, 32.56), P("Jinja Kawempe A", "village", 4, 0.38, 32.56), P("Nakawa", "suburb", 3, 0.33, 32.62),
  ];
  it("puts whole names and name starts first, bigger places first", () => {
    expect(searchPlaces(places, "kawempe").map((p) => p.name)).toEqual(["Kawempe", "Jinja Kawempe A"]);
    expect(searchPlaces(places, "KA").map((p) => p.name)).toEqual(["Kampala", "Kawempe", "Jinja Kawempe A", "Nakawa"]);   // anywhere-matches last
    expect(searchPlaces(places, "k")).toEqual([]);
  });
  it("tells same-named places apart by a bigger place nearby", () => {
    const [a, b] = searchPlaces(places, "kisenyi");
    expect(placeContext(a!, places)).not.toBe(placeContext(b!, places));
    expect(placeContext(places[3]!, places)).toBe("area in Kawempe");
  });
});
