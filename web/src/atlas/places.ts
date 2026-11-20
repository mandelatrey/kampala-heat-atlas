import { getJson, useLoad, type Load } from "../data";

/** One place in docs/atlas/places.json (written by scripts/14b_places.py from OpenStreetMap). */
export interface Place {
  name: string;
  kind: string;
  /** 1 = city ... 5 = neighbourhood. */
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

/** Lower case, accents and punctuation removed: "Kasubi Hill" and "kasubi-hill" match. */
export const normalise = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Places matching a typed query, best first: whole name, then name start, then a word start, then anywhere;
 * bigger places (lower rank) first within each, then shorter names.
 */
export function searchPlaces(places: Place[], query: string, limit = 8): Place[] {
  const q = normalise(query);
  if (q.length < 2) return [];
  const score = (p: Place) => {
    const n = normalise(p.name);
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.split(" ").some((w) => w.startsWith(q))) return 2;
    return n.includes(q) ? 3 : 9;
  };
  return places
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || a.p.rank - b.p.rank || a.p.name.length - b.p.name.length || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}

const KIND_WORD: Record<string, string> = {
  city: "city", town: "town", suburb: "suburb", quarter: "area", neighbourhood: "neighbourhood", village: "area",
  island: "island", hill: "hill", peak: "hill",
};

/** A short line that tells same-named places apart: "suburb near Kawempe". */
export function placeContext(p: Place, places: Place[]): string {
  const word = KIND_WORD[p.kind] ?? "place";
  const bigger = places.filter((o) => o.rank <= 3 && normalise(o.name) !== normalise(p.name));
  const near = nearest(bigger, p.lat, p.lon, 12);
  return near ? `${word} ${near.km < 1.5 ? "in" : "near"} ${near.place.name}` : word;
}

/** At most `max` places, biggest first, none within `minKm` of one already kept: labels that do not crowd. */
export function thinPlaces(places: Place[], minKm = 0.4, max = 15): Place[] {
  const kept: Place[] = [];
  for (const p of [...places].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))) {
    if (kept.length >= max) break;
    if (!nearest(kept, p.lat, p.lon, minKm)) kept.push(p);
  }
  return kept;
}
