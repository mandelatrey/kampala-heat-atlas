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
