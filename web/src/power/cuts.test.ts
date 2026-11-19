import { describe, expect, it } from "vitest";
import { cutsAt, cutsSentence, kampalaToday, plannedNear, plannedSentence, type LoggedArea, type PowerData } from "./cuts";

// Made-up power data for the tests only.
const area = (name: string, lat: number, lon: number, extra: Partial<LoggedArea> = {}): LoggedArea => ({
  name, lat, lon, days: 10, zero_days: 4, rate: "diary", hours_week: 12.6, cuts_week: 4, cut_days: {}, first: "2026-11-01", last: "2026-11-10", sources: ["diary"], ...extra,
});
const data: PowerData = {
  generated: "2026-11-19", log_rows: 20, near_logged_km: 1,
  areas: [area("Alpha", 0.30, 32.50), area("Beta", 0.40, 32.60, { rate: "reported only", zero_days: 0, days: 3 })],
  model: { chosen: "area features", used: true, areas: 8, loo_mae_hours_week: { average: 6, "nearest areas": 5, "area features": 3.6 } },
  estimates: [{ name: "Gamma", lat: 0.35, lon: 32.55, hours_week: 7.24 }],
  planned: [
    { area: "Alpha", lat: 0.30, lon: 32.50, date: "2026-11-29", start: "07:00", end: "18:00", hours: 11, source: "UEDCL notice" },
    { area: "Alpha", lat: 0.30, lon: 32.50, date: "2026-11-02", start: "", end: "", hours: 4, source: "" },
  ],
};

describe("power cuts at a point", () => {
  it("uses a logged area within a kilometre", () => {
    const c = cutsAt(data, { lat: 0.302, lon: 32.501 });
    expect(c.kind).toBe("logged");
    expect(cutsSentence(c)).toEqual({ text: "about 13 hours a week without power in Alpha, from 10 days logged (Sun 1 Nov to Tue 10 Nov).", tone: "hot" });
  });
  it("does not turn reports of cuts into a weekly rate", () => {
    expect(cutsSentence(cutsAt(data, { lat: 0.4, lon: 32.6 })).text).toMatch(/not a weekly rate/);
  });
  it("uses the model's estimate nearby, with its held-out error", () => {
    const c = cutsAt(data, { lat: 0.355, lon: 32.555 });
    expect(c.kind).toBe("estimate");
    expect(cutsSentence(c).text).toBe("Estimated about 7.2 hours a week without power, from logged areas that are built up in a similar way (8 areas in the log). Estimates like this have been off by about 4 hours a week.");
  });
  it("gives no estimate when the model was not good enough", () => {
    const c = cutsAt({ ...data, model: { ...data.model, used: false } }, { lat: 0.355, lon: 32.555 });
    expect(c.kind).toBe("none");
    expect(cutsSentence(c).text).toBe("No power-cut records near here yet. The nearest logged area, Beta (7 km away), has cuts reported but no weekly rate.");
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
