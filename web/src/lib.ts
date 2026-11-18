import type { HourStatus, MonthRow, Status } from "./types";

/** Folder name for a site, the same rule as SLUG in scripts/29_site_weather.py. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

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

/** Hour cells for a trade strip, flagging where the working day skips hours (the lunch break). */
export function hourCells(hours: [number, HourStatus][]): { hour: number; status: HourStatus; gapBefore: boolean }[] {
  return hours.map(([hour, status], i) => ({
    hour,
    status,
    gapBefore: i > 0 && hour !== (hours[i - 1]?.[0] ?? hour) + 1,
  }));
}

export const STATUS_PILL: Record<Status, { cls: "go" | "lim" | "stop"; word: string }> = {
  STOP: { cls: "stop", word: "Stop" },
  LIMITED: { cls: "lim", word: "Limited" },
  CAUTION: { cls: "lim", word: "Go with care" },
  GO: { cls: "go", word: "Go" },
};

/** Card title for a trade that has limits today. */
export function tradeTitle(row: { key: string; status: Status; windows: string }): string {
  if (row.status === "STOP") return "No window today";
  if (row.key === "labour") return "Work/rest cycles";
  return row.windows ? `Go ${row.windows}` : "Go with care";
}

/** "08:00-17:00, lunch excluded (8 h)" -> "08:00-17:00" */
export function workingSpan(working: string): string {
  return working.split(",")[0]?.trim() ?? working;
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
