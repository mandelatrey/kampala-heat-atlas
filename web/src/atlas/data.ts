import { getJson, useLoad, type Load } from "../data";
import { dataUrl } from "../lib";
import type { Atlas } from "./types";

/** URL of a file under docs/atlas/, as listed in atlas.json. */
export const atlasUrl = (path: string) => dataUrl(`atlas/${path}`);

export function useAtlas(): Load<Atlas> {
  return useLoad("atlas", () => getJson<Atlas>("atlas/atlas.json"));
}
