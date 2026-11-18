import type { MonthRow } from "./types";

/** URL of a file the Python scripts wrote, relative to the built app in docs/app/. */
export function dataUrl(path: string): string {
  return `../${path.replace(/^\/+/, "")}`;
}

/**
 * Split a headline around the first key time or amount, which the page highlights,
 * using the same pattern as note_cards() in scripts/29_site_weather.py.
 */
export function splitHeadline(headline: string): [before: string, mark: string, after: string] {
  const m = /(\d{2}(?::\d{2})?-\d{2} h|from \d{2}:00|\d+ mm)/.exec(headline);
  if (!m) return [headline, "", ""];
  return [headline.slice(0, m.index), m[0], headline.slice(m.index + m[0].length)];
}

/** Minimal CSV reader for the pipeline's own files: a header row, comma-separated, no quoted fields. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift()?.split(",") ?? [];
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function toMonthRows(rows: Record<string, string>[]): MonthRow[] {
  return rows.map((r) => ({
    month: r.month ?? "",
    days_recorded: num(r.days_recorded),
    rain_mm: num(r.rain_mm),
    rain_pct_of_normal_pro_rata: r.rain_pct_of_normal_pro_rata ? num(r.rain_pct_of_normal_pro_rata) : null,
    heavy_rain_days: num(r.heavy_rain_days),
    exceptional_rain_days: num(r.exceptional_rain_days),
    lost_hours_concrete: num(r.lost_hours_concrete),
    lost_hours_labour: num(r.lost_hours_labour),
  }));
}
