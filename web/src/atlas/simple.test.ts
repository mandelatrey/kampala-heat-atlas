import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GLOSSARY } from "../glossary";
import { normaliseAtlas } from "./data";
import { simpleAtlas, simpleLayer } from "./simple";
import type { Atlas, AtlasLayer, OldAtlas } from "./types";

const DIR = resolve(process.env.KHA_DOCS ?? resolve(import.meta.dirname, "../../../docs"), "atlas");
const atlas = normaliseAtlas(JSON.parse(readFileSync(resolve(DIR, "atlas.json"), "utf-8")) as Atlas | OldAtlas);

describe("simple mode", () => {
  it("has plain words for every layer in the committed atlas", () => {
    for (const l of simpleAtlas(atlas).layers) {
      const raw = atlas.layers.find((x) => x.id === l.id)!;
      expect(l.caption, l.id).not.toBe(raw.caption);
      expect(l.caption, l.id).not.toMatch(/emissivity|morphology|random forest|standard deviation|NDVI/i);
      expect(["Heat", "How the city grew", "Housing", "What could help"], l.id).toContain(l.group);
    }
  });

  it("keeps the year in the label and renames jargon classes", () => {
    const l: AtlasLayer = {
      id: "informal-2025", group: "People", label: "Informal-type settlement", caption: "x", src: "a.tif",
      style: { kind: "classes", classes: [{ value: 1, color: "#000000", name: "informal-type morphology" }] },
    };
    expect(simpleLayer(l).style).toEqual({ kind: "classes", classes: [{ value: 1, color: "#000000", name: "small, tightly packed housing" }] });
    expect(simpleLayer({ ...l, id: "thermal-2021", label: "Thermal classes 2021" }).label).toBe("Hot and cool areas 2021");
    expect(simpleLayer({ ...l, id: "unknown", group: "Response" }).label).toBe("Informal-type settlement");
  });

  it("explains every glossary term in a sentence or two", () => {
    for (const [id, g] of Object.entries(GLOSSARY)) {
      expect(g.short.length, id).toBeGreaterThan(30);
      expect(g.short.length, id).toBeLessThan(300);
    }
  });
});
