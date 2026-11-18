// Pure summaries behind the site-weather views. Everything here is derived from the briefing the
// Python scripts write; nothing is forecast or decided in the browser.
import type { DayBriefing, HourStatus, Status, TradeRow } from "../types";

export type Tone = "good" | "warning" | "critical";

/** Status of a trade for the day, as a colour role. CAUTION and LIMITED both mean "work, with limits". */
export function statusTone(s: Status): Tone {
  return s === "GO" ? "good" : s === "STOP" ? "critical" : "warning";
}

export const STATUS_WORD: Record<Status, string> = { GO: "Go", CAUTION: "Go with care", LIMITED: "Limited", STOP: "Stop" };

export function hourTone(s: HourStatus): Tone {
  return s === 0 ? "good" : s === 1 ? "warning" : "critical";
}

export interface HourShare {
  hour: number;
  /** Trades with no weather limit in this hour. */
  go: number;
  total: number;
}

/** For each working hour, how many trades can work without weather limits. */
export function hourShares(rows: TradeRow[]): HourShare[] {
  const hours = rows[0]?.hours.map(([h]) => h) ?? [];
  return hours.map((hour) => ({
    hour,
    go: rows.filter((r) => r.hours.find(([h]) => h === hour)?.[1] === 0).length,
    total: rows.length,
  }));
}

/** Tone of an hour from the share of trades that can work: all, most (at least half), or few. */
export function shareTone({ go, total }: HourShare): Tone {
  if (total === 0 || go === total) return "good";
  return go * 2 >= total ? "warning" : "critical";
}

/** Share of all trade-hours in the day that are go hours (0-1). */
export function workableShare(day: DayBriefing): number {
  const perTrade = day.rows[0]?.hours.length ?? 0;
  const total = day.rows.length * perTrade;
  if (total === 0) return 0;
  return day.rows.reduce((sum, r) => sum + r.go_hours, 0) / total;
}

const SHORT_DAY = (day: string) => day.split(" ")[0]?.slice(0, 3) ?? day;

/** One line for the week, e.g. "Storms likely Thu and Sat · best day Mon". */
export function weekSummary(days: DayBriefing[]): string {
  if (days.length === 0) return "";
  const likely = days.filter((d) => d.facts.storm === "likely").map((d) => SHORT_DAY(d.day));
  const possible = days.filter((d) => d.facts.storm === "possible").length;
  const storms =
    likely.length === 1 ? `Storms likely ${likely[0]}`
    : likely.length > 1 ? `Storms likely ${likely.slice(0, -1).join(", ")} and ${likely.at(-1)}`
    : possible ? `Storms possible on ${possible} day${possible > 1 ? "s" : ""}`
    : "No storm risk this week";
  const best = days.reduce((a, b) => (workableShare(b) > workableShare(a) ? b : a));
  return `${storms} · best day ${SHORT_DAY(best.day)}`;
}

/** The first day with storms likely, other than the one on screen, or -1. */
export function stormAlert(days: DayBriefing[], selected: number): number {
  return days.findIndex((d, i) => i !== selected && d.facts.storm === "likely");
}

export type Sky = "storm" | "heat" | "wet" | "clear";

/** Mood of the hero card: storms first, then heat stress, then rain, else clear. */
export function sky(day: DayBriefing, wbgtContinuous = 28): Sky {
  if (day.facts.storm === "likely") return "storm";
  if (day.facts.wbgt_peak >= wbgtContinuous) return "heat";
  if (day.facts.rain_mm >= 5 || day.facts.storm === "possible") return "wet";
  return "clear";
}

/** Tone of a measured value against a caution and a stop limit. */
export function limitTone(value: number, caution: number, stop: number): Tone {
  return value >= stop ? "critical" : value >= caution ? "warning" : "good";
}

/** Position of a value on a scale, clamped to 0-1. */
export function scale(value: number, min: number, max: number): number {
  return max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
}
