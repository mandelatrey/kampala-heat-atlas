// docs/power/power.json (scripts/33_power.py): power cuts logged by area, estimates for other places, upcoming
// planned cuts. What the atlas can say about power cuts at a point.
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

export interface PowerData {
  generated: string;
  log_rows: number;
  near_logged_km: number;
  /** Typical length of a reported cut day, hours (from the reports that give one). */
  hours_per_cut_day: number | null;
  areas: LoggedArea[];
  model: { chosen: string; used: boolean; areas: number; loo_mae_cut_days_week: Record<string, number> };
  estimates: { name: string; lat: number; lon: number; cut_days_week: number }[];
  planned: { area: string; lat: number; lon: number; date: string; start: string; end: string; hours: number | null; source: string }[];
  /** Reported cuts by the hour they were reported, 0-23 (older files lack it). */
  reported_hours?: number[];
  /** Figures from news and reports: a cut rate for named areas over a period (older files lack it). */
  published?: Published[];
}

export interface Published {
  areas: string[];
  lat: number;
  lon: number;
  from: string;
  to: string;
  cuts_per_month: number;
  /** e.g. "up to" */
  qualifier: string;
  source: string;
  url: string;
  note: string;
}

/** The power data, or null when there is none yet (the atlas then says nothing about power cuts). */
export function usePower(): Load<PowerData | null> {
  return useLoad("power", () => getJson<PowerData>("power/power.json").then((d) => (d.areas.length || d.planned.length || d.published?.length ? d : null), () => null));
}

export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dy = (a.lat - b.lat) * 111.32;
  const dx = (a.lon - b.lon) * 111.32 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

function closest<T extends { lat: number; lon: number }>(items: T[], at: { lat: number; lon: number }): { item: T; km: number } | null {
  let best: { item: T; km: number } | null = null;
  for (const item of items) {
    const d = km(item, at);
    if (!best || d < best.km) best = { item, km: d };
  }
  return best;
}

const ESTIMATE_WITHIN_KM = 2;

export type CutsHere =
  | { kind: "logged"; area: LoggedArea; km: number }
  | { kind: "estimate"; place: string; km: number; cutDaysWeek: number; model: string; errorDays: number; areas: number }
  | { kind: "none"; nearest: { area: LoggedArea; km: number } | null };

/** What the power data says about a point: a watched area close by, else the model's estimate, else the nearest record. */
export function cutsAt(d: PowerData, at: { lat: number; lon: number }): CutsHere {
  const logged = closest(d.areas, at);
  if (logged && logged.km <= d.near_logged_km) return { kind: "logged", area: logged.item, km: logged.km };
  const est = d.model.used ? closest(d.estimates, at) : null;
  if (est && est.km <= ESTIMATE_WITHIN_KM) {
    return {
      kind: "estimate", place: est.item.name, km: est.km, cutDaysWeek: est.item.cut_days_week, model: d.model.chosen,
      errorDays: d.model.loo_mae_cut_days_week[d.model.chosen] ?? NaN, areas: d.model.areas,
    };
  }
  return { kind: "none", nearest: logged ? { area: logged.item, km: logged.km } : null };
}

/** Hours a week without power at a point, for the solar calculator: logged hours, else cut days x a typical cut day. */
export function hoursAt(d: PowerData, c: CutsHere): number | null {
  if (c.kind === "logged") {
    if (c.area.basis !== "sampled") return null;
    return c.area.hours_week ?? (d.hours_per_cut_day === null ? null : c.area.cut_days_week * d.hours_per_cut_day);
  }
  if (c.kind === "estimate") return d.hours_per_cut_day === null ? null : c.cutDaysWeek * d.hours_per_cut_day;
  return null;
}

/** Planned cuts announced for areas within `withinKm`, from `today` (YYYY-MM-DD) on, soonest first. */
export function plannedNear(d: PowerData, at: { lat: number; lon: number }, today: string, withinKm = 2) {
  return d.planned.filter((p) => p.date >= today && km(p, at) <= withinKm);
}

/** Today's date in Kampala, YYYY-MM-DD. */
export function kampalaToday(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const monthYear = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
/** "Sun 1 Nov to Sat 14 Nov", with years when the period is not all in one recent year. */
const span = (a: string, b: string, now = new Date()) => {
  if (a.slice(0, 4) === b.slice(0, 4) && a.slice(0, 4) === String(now.getUTCFullYear())) return `${day(a)} to ${day(b)}`;
  return a.slice(0, 7) === b.slice(0, 7) ? `${day(a)} to ${day(b)} ${a.slice(0, 4)}` : `${monthYear(a)} to ${monthYear(b)}`;
};

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

/** One plain sentence for the place card. */
export function cutsSentence(c: CutsHere): { text: string; tone: "hot" | "neutral" } {
  if (c.kind === "logged") {
    const a = c.area;
    const where = c.km < 0.5 ? a.name : `${a.name} (${c.km.toFixed(1)} km away)`;
    if (a.basis === "reports only") {
      return { text: `Cuts reported in ${where} on ${a.cut_days} day${a.cut_days === 1 ? "" : "s"} (${span(a.first, a.last)}). These are reports someone found, not every cut in that time, so they do not say how often the power goes off.`, tone: "neutral" };
    }
    const from = a.sources.length ? `; from ${a.sources.join(", ")}` : "";
    if (a.cut_days === 0) return { text: `No cuts reported in ${where} over the ${a.days} days it was watched (${span(a.first, a.last)}${from}).`, tone: "neutral" };
    const hours = a.hours_week === null ? "" : ` About ${Math.round(a.hours_week)} hours a week in all.`;
    return {
      text: `Power went off ${daysAWeek(a.cut_days_week)} in ${where}: cuts reported on ${a.cut_days} of ${a.days} days watched (${span(a.first, a.last)}${from}).${hours} Only reported cuts count, so the real figure may be higher.`,
      tone: a.cut_days_week >= 2 ? "hot" : "neutral",
    };
  }
  if (c.kind === "estimate") {
    const how = c.model === "nearest areas" ? "the nearest watched areas" : "watched areas that are built up in a similar way";
    const err = Number.isFinite(c.errorDays) ? ` Estimates like this have been off by about ${c.errorDays < 1 ? "half a day" : `${Math.round(c.errorDays)} day${Math.round(c.errorDays) === 1 ? "" : "s"}`} a week.` : "";
    return { text: `Estimated: power goes off ${daysAWeek(c.cutDaysWeek)}, judging from ${how} (${c.areas} areas).${err}`, tone: c.cutDaysWeek >= 2 ? "hot" : "neutral" };
  }
  const n = c.nearest;
  return {
    text: !n ? "No power-cut records near here yet."
      : n.area.basis === "sampled"
        ? `No power-cut records near here yet. In the nearest watched area, ${n.area.name} (${n.km.toFixed(0)} km away), power went off ${n.area.cut_days === 0 ? "on none of the days watched" : daysAWeek(n.area.cut_days_week)}.`
        : `No power-cut records near here yet. The nearest area with reports is ${n.area.name} (${n.km.toFixed(0)} km away).`,
    tone: "neutral",
  };
}

/** "Planned cut Sat 29 Nov, 07:00–18:00, in Kawempe (UEDCL notice)." */
export function plannedSentence(p: PowerData["planned"][number]): string {
  const when = p.start && p.end ? `, ${p.start}–${p.end}` : p.hours ? `, about ${p.hours} hours` : "";
  return `Planned cut ${day(p.date)}${when}, in ${p.area}${p.source ? ` (${p.source})` : ""}.`;
}

/** Published figures for areas within `withinKm`. */
export function publishedNear(d: PowerData, at: { lat: number; lon: number }, withinKm = 3): Published[] {
  return (d.published ?? []).filter((p) => km(p, at) <= withinKm);
}

/** "Up to 13 cuts a month in Najjera, Kiwatule, Kigowa and Buwate in Aug to Oct 2019 (CEO East Africa, ...)." */
export function publishedSentence(p: Published): string {
  const names = p.areas.length > 1 ? `${p.areas.slice(0, -1).join(", ")} and ${p.areas[p.areas.length - 1]}` : p.areas[0] ?? "this area";
  const lead = `${p.qualifier ? `${p.qualifier[0]!.toUpperCase()}${p.qualifier.slice(1)} ` : ""}${p.cuts_per_month} cuts a month`;
  return `${lead} in ${names}, ${span(p.from, p.to)} (${p.source}).`;
}

/** When reported cuts were reported: the share between 6 pm and midnight, once there are enough with a time. */
export function eveningShare(d: PowerData, min = 20): { n: number; evening: number } | null {
  const h = d.reported_hours ?? [];
  const n = h.reduce((a, b) => a + b, 0);
  return n >= min ? { n, evening: h.slice(18).reduce((a, b) => a + b, 0) / n } : null;
}
