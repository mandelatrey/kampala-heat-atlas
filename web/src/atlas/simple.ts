// Plain-language names, groups and captions for the map layers, used in simple mode. The research wording comes
// from atlas.json (scripts/14_atlas.py) and stays the detailed mode. A layer not listed here keeps its own words.
import type { Atlas, AtlasLayer } from "./types";

const GROUPS: Record<string, string> = { Heat: "Heat", Growth: "How the city grew", People: "Housing", Response: "What could help" };

const SURFACE = "Ground and roofs, measured by satellite in the dry season: not the air temperature you feel.";

const LAYERS: Record<string, { label: (y: string) => string; caption: string; classNames?: Record<string, string> }> = {
  "thermal-2025": { label: (y) => `Hot and cool areas ${y}`, caption: `Each square is coloured by how hot it gets compared with the rest of the city. ${SURFACE}` },
  "thermal-2021": { label: (y) => `Hot and cool areas ${y}`, caption: `The same map for an earlier year. ${SURFACE}` },
  "thermal-2017": { label: (y) => `Hot and cool areas ${y}`, caption: `The same map for the earliest year. ${SURFACE}` },
  "lst-2025": { label: (y) => `How hot it gets ${y}`, caption: `Degrees hotter (red) or cooler (blue) than the city average. ${SURFACE}` },
  "lst-change": { label: () => "Getting hotter or cooler", caption: "Red places have warmed compared with the rest of the city since the first year; blue places have cooled. Read it for local differences, not exact numbers." },
  "hot-persistence": { label: () => "Places that stay hot", caption: `How many of the three years each place was among the hottest. ${SURFACE}` },
  "landcover-2025": { label: (y) => `What covers the ground ${y}`, caption: "Buildings, trees, crops, bare soil, wetland or water, mapped from satellite images." },
  "landcover-2017": { label: (y) => `What covers the ground ${y}`, caption: "The same map for the earliest year: compare it with the latest to see what changed." },
  growth: { label: () => "Where the city grew", caption: "Grey was already built in the first year; orange and red were built since." },
  "informal-2025": { label: () => "Small, tightly packed housing", caption: "Areas of small, closely packed, low buildings, found from the size and spacing of buildings. It describes how places are built, not who lives there.", classNames: { "informal-type morphology": "small, tightly packed housing" } },
  trees: { label: () => "Where to plant trees first", caption: "Where heat, many people and open ground meet. The darker the green, the more good a new tree would do." },
  solar: { label: () => "Rooftop solar potential", caption: "How much electricity the roofs in each block could make in a year, allowing for shade from neighbouring buildings." },
};

/** A layer in plain words. */
export function simpleLayer(l: AtlasLayer): AtlasLayer {
  const s = LAYERS[l.id];
  const group = GROUPS[l.group] ?? l.group;
  if (!s) return { ...l, group };
  const year = /\d{4}/.exec(l.label)?.[0] ?? "";
  const style = s.classNames && l.style.kind === "classes"
    ? { ...l.style, classes: l.style.classes.map((c) => ({ ...c, name: s.classNames![c.name] ?? c.name })) }
    : l.style;
  return { ...l, group, label: s.label(year).trim(), caption: s.caption, style };
}

/** The atlas with every layer in plain words. */
export const simpleAtlas = (a: Atlas): Atlas => ({ ...a, layers: a.layers.map(simpleLayer) });
