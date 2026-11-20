// docs/power/power.json (scripts/33_power.py): what the atlas can say about power cuts at a point. Measured figures
// from studies of the utility's outage records come first (for the area a study covers, else a typical Kampala
// range); news figures and residents' complaints are shown beside them, never as a rate for a whole area.
import { getJson, useLoad, type Load } from "../data";

export interface LoggedArea {
  name: string;
  lat: number;
  lon: number;
  /** "sampled": watched over a declared period, unreported days counted as power on; "reports only": no period. */
  basis: "sampled" | "reports only";
  first: string;
  last: string;
  days: number;
  cut_days: number;
  cut_days_week: number;
  /** Only when every reported cut day said how long it lasted. */
  hours_week: number | null;
  kinds: Record<string, number>;
  sources: string[];
}

/** A published figure: cuts (and hours) a month for named areas over a period, shown within radius_km. */
export interface Published {
  areas: string[];
  lat: number;
  lon: number;
  radius_km: number;
  from: string;
  to: string;
  cuts_per_month: number;
  hours_per_month: number | null;
  hours_per_cut: number | null;
  /** "measured": utility outage records (in a study); "reported": news, residents. */
  basis: "measured" | "reported";
  /** e.g. "up to" */
  qualifier: string;
  label: string;
  source: string;
  url: string;
  note: string;
}

export interface PowerData {
  generated: string;
  log_rows: number;
  near_logged_km: number;
  /** Typical length of a reported cut day, hours (from the complaints that give one). */
  hours_per_cut_day: number | null;
  areas: LoggedArea[];
  planned: { area: string; lat: number; lon: number; date: string; start: string; end: string; hours: number | null; source: string }[];
  /** Reported cuts by the hour they were reported, 0-23. */
  reported_hours: number[];
  published: Published[];
}

type At = { lat: number; lon: number };

/** The power data, or null when there is none (the atlas then says nothing about power cuts). */
export function usePower(): Load<PowerData | null> {
  return useLoad("power", () => getJson<PowerData>("power/power.json").then(
    (d) => (d.areas?.length || d.planned?.length || d.published?.length ? { ...d, published: d.published ?? [], reported_hours: d.reported_hours ?? [] } : null),
    () => null,
  ));
}

export function km(a: At, b: At): number {
  const dy = (a.lat - b.lat) * 111.32;
  const dx = (a.lon - b.lon) * 111.32 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

const WEEKS_PER_MONTH = 52 / 12;

// ---- measured figures

/** The measured figure whose area covers the point (the nearest, if several do). */
export function measuredAt(d: PowerData, at: At): Published | null {
  let best: { p: Published; km: number } | null = null;
  for (const p of d.published) {
    if (p.basis !== "measured") continue;
    const k = km(p, at);
    if (k <= p.radius_km && (!best || k < best.km)) best = { p, km: k };
  }
  return best?.p ?? null;
}

export interface Typical {
  cutsPerMonth: [number, number];
  hoursPerMonth: [number, number];
  hoursPerCut: [number, number];
  /** Mean of the measured figures, hours without power a week. */
  hoursPerWeek: number;
  hoursPerCutMean: number;
  labels: string[];
}

/** The range across all measured figures, for places no study covers. */
export function typical(d: PowerData): Typical | null {
  const m = d.published.filter((p) => p.basis === "measured" && p.hours_per_month !== null && p.hours_per_cut !== null);
  if (!m.length) return null;
  const range = (f: (p: Published) => number): [number, number] => [Math.min(...m.map(f)), Math.max(...m.map(f))];
  const mean = (f: (p: Published) => number) => m.reduce((a, p) => a + f(p), 0) / m.length;
  return {
    cutsPerMonth: range((p) => p.cuts_per_month), hoursPerMonth: range((p) => p.hours_per_month!), hoursPerCut: range((p) => p.hours_per_cut!),
    hoursPerWeek: mean((p) => p.hours_per_month!) / WEEKS_PER_MONTH, hoursPerCutMean: mean((p) => p.hours_per_cut!),
    labels: m.map((p) => `${p.label.replace(/\s*\(.*\)$/, "")}, ${yearsOf(p)}`),
  };
}

/** Hours a week without power at a point, for the solar calculator: a sampled log rate, else a measured figure, else typical. */
export function hoursAt(d: PowerData, at: At): { hours: number; from: string } | null {
  const logged = d.areas.find((a) => a.basis === "sampled" && a.hours_week !== null && km(a, at) <= d.near_logged_km);
  if (logged) return { hours: logged.hours_week!, from: `${logged.name}, from the atlas's log` };
  const m = measuredAt(d, at);
  if (m?.hours_per_month) return { hours: m.hours_per_month / WEEKS_PER_MONTH, from: `${m.label}, ${yearsOf(m)}, from utility records` };
  const t = typical(d);
  return t ? { hours: t.hoursPerWeek, from: "typical for Kampala, from utility records" } : null;
}

/** The typical length of one cut at a point (measured figure, else the Kampala mean), hours. */
export function cutLengthAt(d: PowerData, at: At | null): number | null {
  const m = at ? measuredAt(d, at) : null;
  return m?.hours_per_cut ?? typical(d)?.hoursPerCutMean ?? null;
}

// ---- words

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const monthYear = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
/** "Sun 1 Nov to Sat 14 Nov", with years when the period is not all in one recent year. */
const span = (a: string, b: string, now = new Date()) => {
  if (a.slice(0, 4) === b.slice(0, 4) && a.slice(0, 4) === String(now.getUTCFullYear())) return `${day(a)} to ${day(b)}`;
  return a.slice(0, 7) === b.slice(0, 7) ? `${day(a)} to ${day(b)} ${a.slice(0, 4)}` : `${monthYear(a)} to ${monthYear(b)}`;
};
/** "2022" for a whole calendar year, else a span. */
const yearsOf = (p: Published) => (p.from.endsWith("-01-01") && p.to.endsWith("-12-31") && p.from.slice(0, 4) === p.to.slice(0, 4) ? p.from.slice(0, 4) : span(p.from, p.to));

/** "1 hour", "1.5 hours". */
export const hoursText = (h: number) => (h === 1 ? "1 hour" : `${h} hours`);

/** "about an hour", "about 1.5 hours", "about 40 minutes". */
export function duration(h: number): string {
  if (h < 0.75) return `about ${Math.max(5, Math.round((h * 60) / 5) * 5)} minutes`;
  const r = Math.round(h * 2) / 2;
  return r === 1 ? "about an hour" : `about ${r} hours`;
}
const num = (v: number) => (v < 10 ? String(Math.round(v * 2) / 2) : String(Math.round(v)));
const between = ([a, b]: [number, number], f: (v: number) => string) => (f(a) === f(b) ? f(a) : `${f(a)} to ${f(b)}`);

/** "about 3 days a week", "about one day every 2 weeks". */
export function daysAWeek(d: number): string {
  if (d >= 6.95) return "every day";
  if (d >= 1) {
    const n = d >= 3 ? Math.round(d) : Math.round(d * 2) / 2;
    return n === 1 ? "about one day a week" : `about ${n} days a week`;
  }
  const weeks = Math.round(1 / d);
  return weeks <= 1 ? "about one day a week" : `about one day every ${weeks} weeks`;
}

/** The main power-cut line for a place: the measured figure for its area, else the typical Kampala range. */
export function cutsLine(d: PowerData, at: At): { text: string; tone: "hot" | "neutral"; url?: string } | null {
  const m = measuredAt(d, at);
  if (m) {
    const hours = m.hours_per_month ? `, about ${Math.round(m.hours_per_month)} hours without power in all` : "";
    const each = m.hours_per_cut ? `; a cut lasted ${duration(m.hours_per_cut)} on average` : "";
    return {
      text: `${m.label}, ${yearsOf(m)}: the average customer had about ${num(m.cuts_per_month)} cuts a month${hours}${each}. Source: ${m.source}. Your street may be on a different line, so yours can differ.`,
      tone: m.cuts_per_month >= 4 ? "hot" : "neutral", url: m.url || undefined,
    };
  }
  const t = typical(d);
  if (!t) return null;
  return {
    text: `No study covers this area. Across Kampala, utility records show the average customer losing power ${between(t.cutsPerMonth, (v) => String(Math.round(v)))} times a month, ${between(t.hoursPerMonth, (v) => String(Math.round(v)))} hours in all, with a cut lasting ${between(t.hoursPerCut, (v) => String(Math.round(v * 2) / 2))} hours on average (${t.labels.join("; ")}). It depends on the power line a building is on.`,
    tone: "neutral",
  };
}

/** Residents' complaints logged near a point, in words; null when none are close. */
export function reportsLine(d: PowerData, at: At): string | null {
  let best: { a: LoggedArea; km: number } | null = null;
  for (const a of d.areas) {
    const k = km(a, at);
    if (k <= d.near_logged_km && (!best || k < best.km)) best = { a, km: k };
  }
  if (!best) return null;
  const a = best.a;
  const where = best.km < 0.5 ? a.name : `${a.name} (${best.km.toFixed(1)} km away)`;
  if (a.basis === "reports only") {
    return `Cuts reported in ${where} on ${a.cut_days} day${a.cut_days === 1 ? "" : "s"} (${span(a.first, a.last)}). These are complaints someone found, not every cut in that time.`;
  }
  const from = a.sources.length ? `; from ${a.sources.join(", ")}` : "";
  if (a.cut_days === 0) return `No cuts reported in ${where} over the ${a.days} days it was watched (${span(a.first, a.last)}${from}).`;
  return `Power went off ${daysAWeek(a.cut_days_week)} in ${where}: cuts reported on ${a.cut_days} of ${a.days} days watched (${span(a.first, a.last)}${from}). Only reported cuts count.`;
}

/** News and other reported figures whose area covers a point. */
export function newsNear(d: PowerData, at: At): Published[] {
  return d.published.filter((p) => p.basis === "reported" && km(p, at) <= p.radius_km);
}

/** "Up to 13 cuts a month in Kigowa, Kiwatule, Buwate and Najjera, Aug 2019 to Oct 2019 (CEO East Africa ...)." */
export function newsSentence(p: Published): string {
  const lead = `${p.qualifier ? `${p.qualifier[0]!.toUpperCase()}${p.qualifier.slice(1)} ` : ""}${num(p.cuts_per_month)} cuts a month`;
  const names = p.label || (p.areas.length > 1 ? `${p.areas.slice(0, -1).join(", ")} and ${p.areas[p.areas.length - 1]}` : p.areas[0] ?? "this area");
  return `${lead} in ${names}, ${span(p.from, p.to)} (${p.source}).`;
}

// ---- planned cuts and timing

/** Planned cuts announced for areas within `withinKm`, from `today` (YYYY-MM-DD) on, soonest first. */
export function plannedNear(d: PowerData, at: At, today: string, withinKm = 2) {
  return d.planned.filter((p) => p.date >= today && km(p, at) <= withinKm);
}

/** Today's date in Kampala, YYYY-MM-DD. */
export function kampalaToday(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** "Planned cut Sat 29 Nov, 07:00–18:00, in Kawempe (UEDCL notice)." */
export function plannedSentence(p: PowerData["planned"][number]): string {
  const when = p.start && p.end ? `, ${p.start}–${p.end}` : p.hours ? `, about ${p.hours} hours` : "";
  return `Planned cut ${day(p.date)}${when}, in ${p.area}${p.source ? ` (${p.source})` : ""}.`;
}

/** When complaints were made: the share between 6 pm and midnight, once there are enough with a time. */
export function eveningShare(d: PowerData, min = 20): { n: number; evening: number } | null {
  const h = d.reported_hours;
  const n = h.reduce((a, b) => a + b, 0);
  return n >= min ? { n, evening: h.slice(18).reduce((a, b) => a + b, 0) / n } : null;
}
