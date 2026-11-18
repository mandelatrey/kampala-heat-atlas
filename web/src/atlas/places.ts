import { getJson, useLoad, type Load } from "../data";

/** One place in docs/atlas/places.json (written by scripts/14b_places.py from OpenStreetMap). */
export interface Place {
  name: string;
  kind: string;
  /** 1 = always shown (cities) ... 5 = only close in (neighbourhoods). */
  rank: number;
  lat: number;
  lon: number;
}

export interface Places {
  source: string;
  fetched: string;
  places: Place[];
}

const NONE: Places = { source: "", fetched: "", places: [] };

/** The place names, or an empty list if the file has not been made yet (the map works without it). */
export function usePlaces(): Load<Places> {
  return useLoad("places", () => getJson<Places>("atlas/places.json").catch(() => NONE));
}

/** Lowest zoom at which each rank is labelled (Leaflet CRS.Simple zoom; the whole area fits at about -1). */
export const MIN_ZOOM: Record<number, number> = { 1: -99, 2: -1.6, 3: -0.8, 4: 0, 5: 0.75 };

export interface Box { x: number; y: number; w: number; h: number }

/** Rough screen size of a label, px. */
export function labelBox(p: Place, x: number, y: number): Box {
  const size = p.rank <= 1 ? 15 : p.rank === 2 ? 13.5 : 12.5;
  const w = p.name.length * size * 0.56 + 10;
  const h = size + 8;
  return { x: x - w / 2, y: y - h / 2, w, h };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Which places to label: those whose rank shows at this zoom and that are on screen, best rank first,
 * skipping any that would overlap a label already placed.
 */
export function chooseLabels(
  places: Place[], zoom: number, toScreen: (p: Place) => [number, number], view: { w: number; h: number },
): Place[] {
  const placed: Box[] = [];
  const chosen: Place[] = [];
  for (const p of [...places].sort((a, b) => a.rank - b.rank)) {
    if (zoom < (MIN_ZOOM[p.rank] ?? 99)) continue;
    const [x, y] = toScreen(p);
    if (x < -40 || y < -20 || x > view.w + 40 || y > view.h + 20) continue;
    const box = labelBox(p, x, y);
    if (placed.some((b) => overlaps(b, box))) continue;
    placed.push(box);
    chosen.push(p);
  }
  return chosen;
}

/** The closest place to a point, with its distance in km, if one is within maxKm. */
export function nearest(places: Place[], lat: number, lon: number, maxKm = 4): { place: Place; km: number } | null {
  let best: { place: Place; km: number } | null = null;
  const c = Math.cos((lat * Math.PI) / 180);
  for (const p of places) {
    const km = Math.hypot((p.lat - lat) * 111.32, (p.lon - lon) * 111.32 * c);
    if (km <= maxKm && (!best || km < best.km)) best = { place: p, km };
  }
  return best;
}
