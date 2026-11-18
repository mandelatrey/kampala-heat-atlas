import type { Building } from "./types";

export type ColourKey = "h" | "kwh" | "loss" | "pen";

export interface Ramp {
  name: string;
  label: string;
  stops: string[];
  dom: [number, number];
  describe: string;
}

// Same ramps as the previous viewer: sequential for height, losses and penalties; diverging around
// the typical roof for sunlight.
export const RAMPS: Record<ColourKey, Ramp> = {
  h: { name: "Height", label: "Building height (m)", stops: ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"], dom: [3, 40], describe: "Taller buildings are darker blue." },
  kwh: { name: "Roof sunlight", label: "Roof sunlight (kWh/m²/yr)", stops: ["#0d366b", "#3987e5", "#cde2fb", "#fde0d2", "#eb6834", "#7a3013"], dom: [900, 1950], describe: "Orange roofs get the most sun a year; blue roofs are shaded by neighbours." },
  loss: { name: "Shading loss", label: "Roof shading loss (%)", stops: ["#fde0d2", "#f29068", "#c95222", "#7a3013"], dom: [0, 40], describe: "Share of a roof's possible sunlight lost to the shade of taller neighbours." },
  pen: { name: "Orientation", label: "Wall sun penalty vs E–W layout (kWh/m²/yr)", stops: ["#f0efec", "#f4a3a2", "#e34948", "#9a2626"], dom: [0, 120], describe: "Extra sun on the walls compared with the same building turned to run east–west." },
};

export const NO_DATA: [number, number, number] = [170, 170, 165];

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colour of a value on a ramp, as [r, g, b]; grey where there is no value. */
export function rampColour(key: ColourKey, v: number | null | undefined): [number, number, number] {
  const r = RAMPS[key];
  if (v === null || v === undefined || Number.isNaN(v)) return NO_DATA;
  const s = r.stops.map(hex);
  const t = Math.max(0, Math.min(1, (v - r.dom[0]) / (r.dom[1] - r.dom[0]))) * (s.length - 1);
  const i = Math.min(Math.floor(t), s.length - 2);
  const f = t - i;
  const a = s[i] ?? NO_DATA;
  const b = s[i + 1] ?? NO_DATA;
  return [0, 1, 2].map((k) => Math.round(a[k]! + (b[k]! - a[k]!) * f)) as [number, number, number];
}

export const value = (b: Building, key: ColourKey): number | null => b[key];

/** Ground shade hours legend, matching the image scripts/17_build_site.py draws (0 to 3+ h). */
export const SHADE_STOPS = ["#fbe7c6", "#86b6ef", "#1c5cab", "#0d366b"];
