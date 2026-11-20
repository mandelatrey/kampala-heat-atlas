import { useEffect, useRef, useState, type RefObject } from "react";
import type { Load } from "../../data";
import { atlasUrl } from "../data";
import { getRaster, type Raster } from "../raster";
import type { Atlas, AtlasLayer } from "../types";

export type Layers = Record<string, { layer: AtlasLayer; raster: Raster }>;

/** True once the element has come near the screen (always true where IntersectionObserver is missing). */
export function useNearScreen(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near]);
  return near;
}

/** The named atlas layers as data, fetched once `ready` turns true (each file once per visit). */
export function useLayers(atlas: Atlas, ids: string[], ready: boolean): Load<Layers> {
  const [state, setState] = useState<Load<Layers>>({ state: "loading" });
  const key = ids.join(",");
  const started = useRef(false);
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    const wanted = ids.map((id) => atlas.layers.find((l) => l.id === id));
    if (wanted.some((l) => !l?.values)) {
      setState({ state: "error", message: "this atlas has no data layers for this" });
      return;
    }
    Promise.all(wanted.map((l) => getRaster(atlasUrl(l!.src)).then((raster) => [l!.id, { layer: l!, raster }] as const)))
      .then((pairs) => setState({ state: "ready", data: Object.fromEntries(pairs) }))
      .catch((err: unknown) => setState({ state: "error", message: err instanceof Error ? err.message : String(err) }));
  }, [ready, key]); // atlas and ids are identified by key
  return state;
}
