import { describe, expect, it } from "vitest";
import { cutsAt, cutsSentence, daysAWeek, hoursAt, kampalaToday, plannedNear, plannedSentence, type LoggedArea, type PowerData } from "./cuts";

// Made-up power data for the tests only.
const area = (name: string, lat: number, lon: number, extra: Partial<LoggedArea> = {}): LoggedArea => ({
  name, lat, lon, basis: "sampled", first: "2026-11-01", last: "2026-11-14", days: 14, cut_days: 6, cut_days_week: 3,
  hours_week: null, kinds: {}, sources: ["X complaint to UEDCL"], ...extra,
});
const data: PowerData = {
  generated: "2026-11-19", log_rows: 20, near_logged_km: 1, hours_per_cut_day: 4,
  areas: [
    area("Alpha", 0.30, 32.50),
    area("Beta", 0.40, 32.60, { basis: "reports only", days: 3, cut_days: 3, cut_days_week: 7, sources: [] }),
    area("Quiet", 0.30, 32.62, { cut_days: 0, cut_days_week: 0 }),
  ],
  model: { chosen: "area features", used: true, areas: 8, loo_mae_cut_days_week: { average: 1.6, "nearest areas": 1.3, "area features": 0.8 } },
  estimates: [{ name: "Gamma", lat: 0.35, lon: 32.55, cut_days_week: 1.6 }],
  planned: [
    { area: "Alpha", lat: 0.30, lon: 32.50, date: "2026-11-29", start: "07:00", end: "18:00", hours: 11, source: "UEDCL notice" },
    { area: "Alpha", lat: 0.30, lon: 32.50, date: "2026-11-02", start: "", end: "", hours: 4, source: "" },
  ],
};

describe("days a week in words", () => {
  it("reads naturally from rare to daily", () => {
    expect([0.25, 0.5, 0.9, 1.2, 2.6, 4.4, 7].map(daysAWeek)).toEqual([
      "about one day every 4 weeks", "about one day every 2 weeks", "about one day a week", "about one day a week",
      "about 2.5 days a week", "about 4 days a week", "every day",
    ]);
  });
});

describe("power cuts at a point", () => {
  it("uses a watched area within a kilometre, counting only reported cuts", () => {
    const c = cutsAt(data, { lat: 0.302, lon: 32.501 });
    expect(c.kind).toBe("logged");
    expect(cutsSentence(c)).toEqual({
      text: "Power went off about 3 days a week in Alpha: cuts reported on 6 of 14 days watched (Sun 1 Nov to Sat 14 Nov; from X complaint to UEDCL). Only reported cuts count, so the real figure may be higher.",
      tone: "hot",
    });
    expect(hoursAt(data, c)).toBe(12);                    // 3 cut days x 4 typical hours
  });
  it("says so when a watched area had no reported cuts", () => {
    expect(cutsSentence(cutsAt(data, { lat: 0.3, lon: 32.62 })).text).toBe("No cuts reported in Quiet over the 14 days it was watched (Sun 1 Nov to Sat 14 Nov; from X complaint to UEDCL).");
  });
  it("does not turn reports without a watching period into a weekly rate", () => {
    const c = cutsAt(data, { lat: 0.4, lon: 32.6 });
    expect(cutsSentence(c).text).toMatch(/not a weekly rate/);
    expect(hoursAt(data, c)).toBeNull();
  });
  it("uses the model's estimate nearby, with its held-out error", () => {
    const c = cutsAt(data, { lat: 0.355, lon: 32.555 });
    expect(c.kind).toBe("estimate");
    expect(cutsSentence(c).text).toBe("Estimated: power goes off about 1.5 days a week, judging from watched areas that are built up in a similar way (8 areas). Estimates like this have been off by about half a day a week.");
    expect(hoursAt(data, c)).toBeCloseTo(6.4, 6);
  });
  it("gives no estimate when the model was not good enough", () => {
    const c = cutsAt({ ...data, model: { ...data.model, used: false } }, { lat: 0.355, lon: 32.555 });
    expect(c.kind).toBe("none");
    expect(cutsSentence(c).text).toMatch(/^No power-cut records near here yet\./);
  });
});

describe("planned cuts", () => {
  it("lists only cuts from today on, nearby", () => {
    const p = plannedNear(data, { lat: 0.3, lon: 32.5 }, "2026-11-19");
    expect(p.map((x) => x.date)).toEqual(["2026-11-29"]);
    expect(plannedNear(data, { lat: 0.5, lon: 32.9 }, "2026-11-19")).toEqual([]);
    expect(plannedSentence(p[0]!)).toBe("Planned cut Sun 29 Nov, 07:00–18:00, in Alpha (UEDCL notice).");
  });
  it("knows the date in Kampala (UTC+3)", () => {
    expect(kampalaToday(new Date("2026-11-19T22:30:00Z"))).toBe("2026-11-20");
  });
});
