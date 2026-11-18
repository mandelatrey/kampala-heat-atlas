import { useEffect, useState } from "react";
import { dataUrl, parseCsv, toMonthRows } from "./lib";
import type { Briefing, MonthRow, Site } from "./types";

export type Load<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T };

async function getText(path: string): Promise<string> {
  const res = await fetch(dataUrl(path), { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return res.text();
}

/** Run an async loader whenever `key` changes; ignore results that arrive after the key moved on. */
function useLoad<T>(key: string, load: () => Promise<T>): Load<T> {
  const [result, setResult] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    setResult({ state: "loading" });
    load().then(
      (data) => live && setResult({ state: "ready", data }),
      (err: unknown) => live && setResult({ state: "error", message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      live = false;
    };
  }, [key]); // `load` is identified by `key`
  return result;
}

export interface SiteList {
  sites: Site[];
  /** Region key -> display name, in the order the regions should appear. */
  groups: Record<string, string>;
}

export function useSites(): Load<SiteList> {
  return useLoad("sites", async () => JSON.parse(await getText("site-weather/sites.json")) as SiteList);
}

export interface SiteData {
  briefing: Briefing;
  /** Empty when the site has no record yet. */
  months: MonthRow[];
}

export function useSite(slug: string): Load<SiteData> {
  return useLoad(slug, async () => {
    const [briefing, months] = await Promise.all([
      getText(`site-weather/${slug}/site_briefing_latest.json`).then((t) => JSON.parse(t) as Briefing),
      getText(`site-weather/${slug}/archive/monthly_index.csv`).then((t) => toMonthRows(parseCsv(t)), () => []),
    ]);
    return { briefing, months };
  });
}
