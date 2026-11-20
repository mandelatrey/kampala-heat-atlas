import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { gradientColors, normaliseAtlas } from "./data";
import type { Numbers, Stats } from "./stats";
import type { Atlas, OldAtlas } from "./types";

// Contract test: the committed docs/atlas/ (scripts/14_atlas.py and 14c_atlas_stats.py) has what the page reads.
// KHA_DOCS=/path/to/docs npm test checks a pipeline run written elsewhere instead.
const DIR = resolve(process.env.KHA_DOCS ?? resolve(import.meta.dirname, "../../../docs"), "atlas");
const raw = JSON.parse(readFileSync(resolve(DIR, "atlas.json"), "utf-8")) as Atlas | OldAtlas;
const atlas = normaliseAtlas(raw);
const stats = JSON.parse(readFileSync(resolve(DIR, "stats.json"), "utf-8")) as Stats;

// every number the page quotes that the tables always provide (the optional ones are checked when present)
const REQUIRED: (keyof Numbers)[] = [
  "built_km2", "sparse_to_dense_km2", "label_agreement", "kappa", "validation_points", "hot_km2", "lst_r", "c2st_coverage",
  "hottest_lcz", "fastest_warming_lcz", "fastest_warming_lcz_change", "dense_trees_anom", "informal_anom", "formal_dense_anom",
  "became_informal_change", "always_formal_change", "sdi_anom", "sdi_dense_anom", "sdi_change", "sdi_dense_change",
  "sdi_detected_share", "cooling_per_10pct_canopy", "planting_cooling", "planting_new_canopy_km2", "planting_people",
  "cooling_model_r2", "very_high_km2", "very_high_people", "very_high_tree_pct", "roofs", "solar_gwp", "solar_gwh",
  "solar_yield", "solar_top10_gwh", "national_sales_gwh", "noon_sun_min_deg", "centre_lat", "low_tilt_max_loss_pct",
  "east_west_wall_ratio",
];

describe("docs/atlas/atlas.json", () => {
  it("has a grid size, three years and a georeferenced grid", () => {
    expect(atlas.size).toHaveLength(2);
    expect(atlas.years).toHaveLength(3);
    expect(atlas.grid.crs).toMatch(/^EPSG:32[67]\d{2}$/);
    expect(atlas.grid.origin).toHaveLength(2);
    expect(atlas.grid.pixel).toBeGreaterThan(0);
  });

  it("lists only files that exist", () => {
    const files = [atlas.base, ...atlas.layers.map((l) => l.src), ...Object.values(atlas.anims ?? {})];
    for (const f of files) expect(existsSync(resolve(DIR, f)), f).toBe(true);
  });

  it("styles every layer", () => {
    for (const l of atlas.layers) {
      if (l.style.kind === "classes") {
        expect(l.style.classes.length, l.id).toBeGreaterThan(0);
        for (const c of l.style.classes) expect(c.color, l.id).toMatch(/^#[0-9a-f]{6}$/i);
      } else {
        expect(l.style.colors.length, l.id).toBeGreaterThan(1);
        expect(l.style.labels, l.id).toHaveLength(3);
        if (l.values) expect(l.style.max! > l.style.min!, l.id).toBe(true);
      }
      if (l.values) expect(l.src, l.id).toMatch(/\.tif$/);
    }
  });

  it("has unique layer ids", () => {
    const ids = atlas.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("docs/atlas/stats.json", () => {
  it("has every number the page quotes", () => {
    for (const k of REQUIRED) expect(stats.numbers[k], k).toBeDefined();
    expect(stats.years).toEqual(atlas.years);
  });

  it("has every chart, each with its table published next to it", () => {
    for (const k of ["landcover", "lcz", "trajectories", "solar", "trees"] as const) {
      const src = stats.charts[k].source;
      expect(stats.tables[src], k).toBeDefined();
      expect(existsSync(resolve(DIR, stats.tables[src]!)), src).toBe(true);
    }
  });

  it("names the hottest zones the LCZ chart shows", () => {
    for (const z of stats.numbers.hottest_lcz) expect(stats.charts.lcz.zones.some((x) => x.name.endsWith(z)), z).toBe(true);
  });
});

describe("atlas.json from before the data export", () => {
  it("is read as styled PNG layers", () => {
    const old: OldAtlas = {
      size: [10, 10], years: [2017, 2021, 2025], base: "base.jpg", grid: { crs: "EPSG:32636", origin: [0, 0], pixel: 30 },
      ramps: { diverging: "linear-gradient(90deg,#0d366b,#f0efec,#701b1b)" },
      layers: [
        { id: "a", group: "Heat", label: "A", caption: "", src: "layers/a.png", kind: "classes", legend: [["#184f95", "cool"], ["#9a2626", "hot"]] },
        { id: "b", group: "Heat", label: "B", caption: "", src: "layers/b.png", kind: "ramp", legend: ["-8", "mean", "+8", "diverging"] },
      ],
    };
    const n = normaliseAtlas(old);
    expect(n.layers[0]!.style).toEqual({ kind: "classes", classes: [{ value: 1, color: "#184f95", name: "cool" }, { value: 2, color: "#9a2626", name: "hot" }] });
    expect(n.layers[1]!.style).toEqual({ kind: "ramp", colors: ["#0d366b", "#f0efec", "#701b1b"], labels: ["-8", "mean", "+8"] });
    expect(n.layers[1]!.values).toBeUndefined();
    expect(gradientColors("linear-gradient(90deg,#abc,#a1b2c3)")).toEqual(["#abc", "#a1b2c3"]);
  });
});

// places.json is optional (scripts/14b_places.py needs internet access); when present it must be well formed
describe("docs/atlas/places.json", () => {
  const file = resolve(DIR, "places.json");
  it.skipIf(!existsSync(file))("lists named places inside the study area", () => {
    const p = JSON.parse(readFileSync(file, "utf-8")) as { source: string; places: { name: string; rank: number; lat: number; lon: number }[] };
    expect(p.source).toMatch(/OpenStreetMap/);
    for (const x of p.places) {
      expect(x.name.length).toBeGreaterThan(0);
      expect(x.lat).toBeGreaterThan(-1);
      expect(x.lat).toBeLessThan(1.5);
      expect(x.lon).toBeGreaterThan(32);
      expect(x.lon).toBeLessThan(33.5);
    }
  });
});
