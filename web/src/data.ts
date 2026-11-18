import { useEffect, useState } from "react";
import { dataUrl, parseCsv, toMonthRows } from "./lib";
import type { Briefing, MonthRow, Site } from "./types";

export type Load<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T };

async function getText(path: string): Promise<string> {
  const res = await fetch(dataUrl(path), { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  // a server that does not have the file may answer with a page instead of a 404
  if ((res.headers.get("content-type") ?? "").includes("text/html")) {
    throw new Error(`${path}: got a web page instead of the data file, so the file is missing or not being served`);
  }
  return res.text();
}

/** Fetch and parse a JSON file written by the Python scripts, path relative to docs/. */
export async function getJson<T>(path: string): Promise<T> {
  const text = await getText(path);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${path}: not valid JSON`);
  }
}

/** Run an async loader whenever `key` changes; ignore results that arrive after the key moved on. */
export function useLoad<T>(key: string, load: () => Promise<T>): Load<T> {
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
  return useLoad("sites", () => getJson<SiteList>("site-weather/sites.json"));
}

export interface SiteData {
  briefing: Briefing;
  /** Empty when the site has no record yet. */
  months: MonthRow[];
}

export function useSite(slug: string): Load<SiteData> {
  return useLoad(slug, async () => {
    const [briefing, months] = await Promise.all([
      getJson<Briefing>(`site-weather/${slug}/site_briefing_latest.json`),
      getText(`site-weather/${slug}/archive/monthly_index.csv`).then((t) => toMonthRows(parseCsv(t)), () => []),
    ]);
    return { briefing, months };
  });
}
