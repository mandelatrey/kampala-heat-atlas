import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Atlas, NumberKey } from "./types";

// Contract test: the committed docs/atlas/ (written by scripts/14_atlas.py) has what the page reads.
const DIR = resolve(import.meta.dirname, "../../../docs/atlas");
const atlas = JSON.parse(readFileSync(resolve(DIR, "atlas.json"), "utf-8")) as Atlas;

const NUMBERS: NumberKey[] = [
  "built0", "built2", "builtpct", "hot0", "hot2", "inf", "formal", "became", "formalchg", "cool10", "treecool",
  "treepeople", "newcanopy", "vh_people", "vh_km2", "gwp", "twh", "roofs", "yield_", "r_min", "r_max", "agree",
];

describe("docs/atlas/atlas.json", () => {
  it("has every headline number the page shows", () => {
    for (const k of NUMBERS) expect(atlas.numbers[k], k).toMatch(/\d/);
  });

  it("has a grid size and three years", () => {
    expect(atlas.size).toHaveLength(2);
    expect(atlas.years).toHaveLength(3);
  });

  it("lists only files that exist", () => {
    const files = [atlas.base, ...atlas.layers.map((l) => l.src), ...Object.values(atlas.charts), ...Object.values(atlas.anims)];
    for (const f of files) expect(existsSync(resolve(DIR, f)), f).toBe(true);
  });

  it("has well-formed legends", () => {
    for (const l of atlas.layers) {
      if (l.kind === "classes") {
        expect(l.legend.length, l.id).toBeGreaterThan(0);
        for (const [color] of l.legend) expect(color, l.id).toMatch(/^#[0-9a-f]{6}$/i);
      } else {
        expect(l.legend, l.id).toHaveLength(4);
        expect(atlas.ramps[l.legend[3]], l.id).toBeDefined();
      }
    }
  });

  it("says where its grid sits, matching the layer size", () => {
    expect(atlas.grid?.crs).toMatch(/^EPSG:32[67]\d{2}$/);
    expect(atlas.grid?.origin).toHaveLength(2);
    expect(atlas.grid?.pixel).toBeGreaterThan(0);
  });

  it("has unique layer ids", () => {
    const ids = atlas.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// places.json is optional (scripts/14b_places.py needs internet access); when present it must be well formed
describe("docs/atlas/places.json", () => {
  const file = resolve(DIR, "places.json");
  it.skipIf(!existsSync(file))("lists named places inside the study area", () => {
    const p = JSON.parse(readFileSync(file, "utf-8")) as { source: string; places: { name: string; rank: number; lat: number; lon: number }[] };
    expect(p.source).toMatch(/OpenStreetMap/);
    for (const x of p.places) {
      expect(x.name.length, JSON.stringify(x)).toBeGreaterThan(0);
      expect(x.rank).toBeGreaterThanOrEqual(1);
      expect(x.lat).toBeGreaterThan(-90);
      expect(x.lon).toBeGreaterThan(-180);
    }
  });
});
