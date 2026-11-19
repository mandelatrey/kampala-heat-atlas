import { getJson, useLoad, type Load } from "../data";
import { dataUrl } from "../lib";
import type { Atlas, AtlasLayer, OldAtlas, OldLayer } from "./types";

/** URL of a file under docs/atlas/, as listed in atlas.json. */
export const atlasUrl = (path: string) => dataUrl(`atlas/${path}`);

/** The colours in a CSS linear-gradient(), in order. */
export function gradientColors(css: string): string[] {
  return css.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
}

function fromOld(l: OldLayer, ramps: Record<string, string>): AtlasLayer {
  const base = { id: l.id, group: l.group, label: l.label, caption: l.caption, src: l.src };
  if (l.kind === "classes") {
    const legend = l.legend as [string, string][];
    return { ...base, style: { kind: "classes", classes: legend.map(([color, name], i) => ({ value: i + 1, color, name })) } };
  }
  const [lo, mid, hi, ramp] = l.legend as [string, string, string, string];
  return { ...base, style: { kind: "ramp", colors: gradientColors(ramps[ramp] ?? ""), labels: [lo, mid, hi] } };
}

/** Accept atlas.json in either form: layers as data (current) or as coloured PNGs (before the data export). */
export function normaliseAtlas(raw: Atlas | OldAtlas): Atlas {
  if (raw.layers.every((l) => "style" in l)) return raw as Atlas;
  const old = raw as OldAtlas;
  return { ...old, layers: old.layers.map((l) => ("style" in l ? (l as unknown as AtlasLayer) : fromOld(l, old.ramps))) };
}

export function useAtlas(): Load<Atlas> {
  return useLoad("atlas", () => getJson<Atlas | OldAtlas>("atlas/atlas.json").then(normaliseAtlas));
}
