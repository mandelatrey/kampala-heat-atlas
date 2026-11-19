// docs/power/power.json (scripts/33_power.py): power cuts logged by area, estimates for other places, upcoming
// planned cuts. What the atlas can say about power cuts at a point.
import { getJson, useLoad, type Load } from "../data";

export interface LoggedArea {
  name: string;
  lat: number;
  lon: number;
  days: number;
  zero_days: number;
  /** "diary": days without cuts were logged too, so hours_week is a rate; "reported only": cuts only. */
  rate: "diary" | "reported only";
  hours_week: number;
  cuts_week: number | null;
  cut_days: Record<string, number>;
  first: string;
  last: string;
  sources: string[];
}

export interface PowerData {
  generated: string;
  log_rows: number;
  near_logged_km: number;
  areas: LoggedArea[];
  model: { chosen: string; used: boolean; areas: number; loo_mae_hours_week: Record<string, number> };
  estimates: { name: string; lat: number; lon: number; hours_week: number }[];
  planned: { area: string; lat: number; lon: number; date: string; start: string; end: string; hours: number; source: string }[];
}

/** The power data, or null when there is none yet (the atlas then says nothing about power cuts). */
export function usePower(): Load<PowerData | null> {
  return useLoad("power", () => getJson<PowerData>("power/power.json").then((d) => (d.areas.length || d.planned.length ? d : null), () => null));
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
  | { kind: "estimate"; place: string; km: number; hoursWeek: number; model: string; errorHours: number; areas: number }
  | { kind: "none"; nearest: { area: LoggedArea; km: number } | null };

/** What the power data says about a point: a logged area close by, else the model's estimate, else the nearest record. */
export function cutsAt(d: PowerData, at: { lat: number; lon: number }): CutsHere {
  const logged = closest(d.areas, at);
  if (logged && logged.km <= d.near_logged_km) return { kind: "logged", area: logged.item, km: logged.km };
  const est = d.model.used ? closest(d.estimates, at) : null;
  if (est && est.km <= ESTIMATE_WITHIN_KM) {
    return {
      kind: "estimate", place: est.item.name, km: est.km, hoursWeek: est.item.hours_week, model: d.model.chosen,
      errorHours: d.model.loo_mae_hours_week[d.model.chosen] ?? NaN, areas: d.model.areas,
    };
  }
  return { kind: "none", nearest: logged ? { area: logged.item, km: logged.km } : null };
}

/** Planned cuts announced for areas within `withinKm`, from `today` (YYYY-MM-DD) on, soonest first. */
export function plannedNear(d: PowerData, at: { lat: number; lon: number }, today: string, withinKm = 2) {
  return d.planned.filter((p) => p.date >= today && km(p, at) <= withinKm);
}

/** Today's date in Kampala, YYYY-MM-DD. */
export function kampalaToday(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

const hrs = (h: number) => (h < 1 ? "under an hour" : `about ${h >= 10 ? Math.round(h) : h.toFixed(1)} hours`);
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** One plain sentence for the place card. */
export function cutsSentence(c: CutsHere): { text: string; tone: "hot" | "neutral" } {
  if (c.kind === "logged") {
    const a = c.area;
    const where = c.km < 0.5 ? a.name : `${a.name} (${c.km.toFixed(1)} km away)`;
    if (a.rate === "reported only") {
      return { text: `${a.days} day${a.days === 1 ? "" : "s"} with cuts reported in ${where} between ${day(a.first)} and ${day(a.last)}. Days without cuts were not logged, so this is not a weekly rate.`, tone: "neutral" };
    }
    return {
      text: `${hrs(a.hours_week)} a week without power in ${where}, from ${a.days} days logged (${day(a.first)} to ${day(a.last)}).`,
      tone: a.hours_week >= 10 ? "hot" : "neutral",
    };
  }
  if (c.kind === "estimate") {
    const how = c.model === "nearest areas" ? "the nearest logged areas" : "logged areas that are built up in a similar way";
    const err = Number.isFinite(c.errorHours) ? ` Estimates like this have been off by about ${Math.round(c.errorHours)} hours a week.` : "";
    return { text: `Estimated ${hrs(c.hoursWeek)} a week without power, from ${how} (${c.areas} areas in the log).${err}`, tone: c.hoursWeek >= 10 ? "hot" : "neutral" };
  }
  return {
    text: c.nearest
      ? `No power-cut records near here yet. The nearest logged area, ${c.nearest.area.name} (${c.nearest.km.toFixed(0)} km away), ${c.nearest.area.rate === "diary" ? `has ${hrs(c.nearest.area.hours_week)} a week` : "has cuts reported but no weekly rate"}.`
      : "No power-cut records near here yet.",
    tone: "neutral",
  };
}

/** "Planned cut Sat 29 Nov, 07:00–18:00, in Kawempe (UEDCL notice)." */
export function plannedSentence(p: PowerData["planned"][number]): string {
  const when = p.start && p.end ? `, ${p.start}–${p.end}` : p.hours ? `, about ${p.hours} hours` : "";
  return `Planned cut ${day(p.date)}${when}, in ${p.area}${p.source ? ` (${p.source})` : ""}.`;
}
