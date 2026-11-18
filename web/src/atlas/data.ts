import { useEffect, useState } from "react";
import { dataUrl } from "../lib";
import type { Load } from "../data";
import type { Atlas } from "./types";

/** URL of a file under docs/atlas/, as listed in atlas.json. */
export const atlasUrl = (path: string) => dataUrl(`atlas/${path}`);

export function useAtlas(): Load<Atlas> {
  const [result, setResult] = useState<Load<Atlas>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    fetch(atlasUrl("atlas.json"), { cache: "no-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`atlas/atlas.json: ${res.status} ${res.statusText}`);
        return res.json() as Promise<Atlas>;
      })
      .then(
        (data) => live && setResult({ state: "ready", data }),
        (err: unknown) => live && setResult({ state: "error", message: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      live = false;
    };
  }, []);
  return result;
}
