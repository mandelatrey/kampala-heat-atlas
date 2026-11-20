import { getJson, useLoad, type Load } from "../data";
import type { DistrictData, Districts } from "./types";

export function useDistricts(): Load<Districts> {
  return useLoad("districts", () => getJson<Districts>("data/districts.json"));
}

// District files are 0.7-4 MB, so each is fetched once per visit and kept.
const cache = new Map<string, Promise<DistrictData>>();

export function useDistrict(file: string | undefined): Load<DistrictData> {
  return useLoad(`district:${file ?? ""}`, () => {
    if (!file) return Promise.reject(new Error("no district selected"));
    let p = cache.get(file);
    if (!p) {
      p = getJson<DistrictData>(file);
      cache.set(file, p);
      p.catch(() => cache.delete(file));
    }
    return p;
  });
}

export { canUseWebGL2 } from "../atlas/mapEngine";
