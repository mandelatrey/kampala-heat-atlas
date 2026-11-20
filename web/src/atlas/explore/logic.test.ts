import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Place } from "../places";
import type { Raster } from "../raster";
import type { Stats } from "../stats";
import type { ValueSpec } from "../types";
import {
  DIRECTIONS, growthByDirection, growthPicture, hotterThan, spreadOut, lczCode, LCZ_WORDS, PACKING_STOPS, rankPlaces, sectorOf, topDirections, TRAJECTORY_WORDS,
} from "./logic";

const SPEC: ValueSpec = { scale: 1, offset: 0, nodata: 0 } as ValueSpec;
const raster = (rows: number[][]): Raster => ({ width: rows[0]!.length, height: rows.length, data: Uint8Array.from(rows.flat()) });

describe("directions", () => {
  it("reads compass sectors with rows growing southwards", () => {
    const c: [number, number] = [5, 5];
    expect(DIRECTIONS[sectorOf(0, 5, c)]).toBe("north");
    expect(DIRECTIONS[sectorOf(5, 9, c)]).toBe("east");
    expect(DIRECTIONS[sectorOf(9, 5, c)]).toBe("south");
    expect(DIRECTIONS[sectorOf(5, 0, c)]).toBe("west");
    expect(DIRECTIONS[sectorOf(0, 9, c)]).toBe("north-east");
    expect(DIRECTIONS[sectorOf(9, 0, c)]).toBe("south-west");
  });
  it("counts new building by direction, in km²", () => {
    // centre at the middle of a 5 x 5 grid; 100 m cells = 0.01 km²; classes 2 and 3 are new, 1 is old
    const r = raster([
      [0, 0, 2, 0, 0],
      [0, 0, 3, 0, 0],
      [1, 0, 0, 0, 2],
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
    ]);
    const km2 = growthByDirection(r, SPEC, [2.5, 2.5], 100, [2, 3]);
    expect(km2[0]).toBeCloseTo(0.02, 10);     // north: two new cells
    expect(km2[2]).toBeCloseTo(0.01, 10);     // east
    expect(km2[4]).toBe(0);                   // south: only old building
    expect(topDirections(km2)).toEqual(["north", "east"]);
  });
  it("draws what had been built by each step", () => {
    const r = raster([[1, 2, 3, 0]]);
    const colors: [number, number, number][] = [[1, 1, 1], [2, 2, 2], [3, 3, 3]];
    const alpha = (step: number) => [0, 1, 2, 3].map((i) => growthPicture(r, SPEC, step, colors)[i * 4 + 3]);
    expect(alpha(0)).toEqual([255, 0, 0, 0]);
    expect(alpha(1)).toEqual([255, 255, 0, 0]);
    expect(alpha(2)).toEqual([255, 255, 255, 0]);
    expect(Array.from(growthPicture(r, SPEC, 2, colors).slice(4, 7))).toEqual([2, 2, 2]);
  });
});

describe("ranking places by heat", () => {
  const P = (name: string, kind = "village"): Place => ({ name, kind, rank: 4, lat: 0, lon: 0 });
  // each place gets its own cells: [heat, built?]
  const cells: Record<string, [number | null, boolean][]> = {
    Hot: [[6, true], [7, true]], Warm: [[2, true], [3, true]], Cool: [[-1, true], [-2, false]],
    Forest: [[-3, false], [-4, false]], Water: [[null, false], [null, false]], City: [[9, true], [9, true]],
  };
  const places = Object.keys(cells).map((n) => (n === "City" ? P(n, "city") : P(n)));
  const index = new Map<number, [number | null, boolean]>();
  const cellsOf = (p: Place) => cells[p.name]!.map((v, i) => {
    const id = p.name.length * 100 + i;
    index.set(id, v);
    return id;
  });
  const ranked = rankPlaces(places, cellsOf, (c) => index.get(c)![0], (c) => index.get(c)![1]);
  it("keeps built-up places, hottest first, and skips cities, forests and water", () => {
    expect(ranked.map((r) => [r.place.name, r.anom])).toEqual([["Hot", 6.5], ["Warm", 2.5], ["Cool", -1.5]]);
  });
  it("says what share of ranked places are cooler", () => {
    expect(hotterThan(ranked, ranked[0]!)).toBe(100);
    expect(hotterThan(ranked, ranked[1]!)).toBe(50);
    expect(hotterThan(ranked, ranked[2]!)).toBe(0);
  });
});

// The committed stats.json: every zone and trajectory the page shows has plain words, and the slider's stops exist.
const stats = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../docs/atlas/stats.json"), "utf-8")) as Stats;

describe("plain words for the committed stats", () => {
  it("covers every Local Climate Zone", () => {
    for (const z of stats.charts.lcz.zones) expect(LCZ_WORDS[lczCode(z.name)], z.name).toBeDefined();
  });
  it("has every packing stop among the zones", () => {
    const codes = stats.charts.lcz.zones.map((z) => lczCode(z.name));
    for (const s of PACKING_STOPS) expect(codes, s).toContain(s);
  });
  it("covers every settlement trajectory", () => {
    for (const s of stats.charts.trajectories.series) expect(TRAJECTORY_WORDS[s.name], s.name).toBeDefined();
  });
});

describe("spreading out a ranked list", () => {
  const at = (name: string, lat: number, anom: number) => ({ place: { name, kind: "village", rank: 4, lat, lon: 32.5 }, anom, built: 1 });
  it("skips places next to one already listed", () => {
    const ranked = [at("A", 0.30, 8), at("A2", 0.305, 7.9), at("B", 0.35, 7), at("C", 0.40, 6), at("C2", 0.401, 5)];
    expect(spreadOut(ranked, 3).map((r) => r.place.name)).toEqual(["A", "B", "C"]);
    expect(spreadOut(ranked, 2).map((r) => r.place.name)).toEqual(["A", "B"]);
  });
});
