import { describe, expect, it } from "vitest";
import {
  cutLengthAt, cutsLine, daysAWeek, duration, eveningShare, hoursAt, kampalaToday, measuredAt, newsNear, newsSentence,
  plannedNear, plannedSentence, reportsLine, typical, type LoggedArea, type PowerData, type Published,
} from "./cuts";

// Made-up power data for the tests only (the shapes follow docs/power/power.json).
const pub = (extra: Partial<Published>): Published => ({
  areas: ["East"], lat: 0.34, lon: 32.62, radius_km: 6, from: "2022-01-01", to: "2022-12-31", cuts_per_month: 5.5,
  hours_per_month: 6.26, hours_per_cut: 1.14, basis: "measured", qualifier: "", label: "East network", source: "A study 2023", url: "https://example.org/s", note: "", ...extra,
});
const area = (name: string, lat: number, lon: number, extra: Partial<LoggedArea> = {}): LoggedArea => ({
  name, lat, lon, basis: "reports only", first: "2019-11-29", last: "2024-08-06", days: 1713, cut_days: 8, cut_days_week: 0.03,
  hours_week: null, kinds: {}, sources: [], ...extra,
});
const data: PowerData = {
  generated: "2026-11-19", log_rows: 10, near_logged_km: 1, hours_per_cut_day: null,
  areas: [area("Najjera", 0.387, 32.625)],
  published: [
    pub({}),
    pub({ areas: ["Kitala"], lat: 0.114, lon: 32.519, radius_km: 5, from: "2024-01-01", to: "2024-12-31", cuts_per_month: 2.85, hours_per_month: 4.48, hours_per_cut: 1.57, label: "Kitala line" }),
    pub({ areas: ["Najjera", "Kiwatule"], lat: 0.383, lon: 32.622, radius_km: 3, from: "2019-08-01", to: "2019-10-31", cuts_per_month: 13, hours_per_month: null,
      hours_per_cut: null, basis: "reported", qualifier: "up to", label: "Kiwatule and Najjera", source: "A newspaper, 2019" }),
  ],
  planned: [
    { area: "Najjera", lat: 0.387, lon: 32.625, date: "2026-11-29", start: "07:00", end: "18:00", hours: 11, source: "UEDCL notice" },
    { area: "Najjera", lat: 0.387, lon: 32.625, date: "2026-11-02", start: "", end: "", hours: 4, source: "" },
  ],
  reported_hours: [2, 1, 0, 0, 0, 1, 0, 0, 3, 3, 4, 0, 0, 0, 1, 0, 1, 1, 3, 5, 4, 3, 1, 1],
};
const EAST = { lat: 0.35, lon: 32.61 }, KITALA = { lat: 0.12, lon: 32.52 }, ELSEWHERE = { lat: 0.23, lon: 32.55 }, NAJJERA = { lat: 0.387, lon: 32.625 };

describe("measured figures", () => {
  it("uses the study whose area covers the point", () => {
    expect(measuredAt(data, EAST)?.label).toBe("East network");
    expect(measuredAt(data, KITALA)?.label).toBe("Kitala line");
    expect(measuredAt(data, ELSEWHERE)).toBeNull();
  });
  it("words a measured figure with its source, and warns lines differ", () => {
    expect(cutsLine(data, EAST)).toEqual({
      text: "East network, 2022: the average customer had about 5.5 cuts a month, about 6 hours without power in all; a cut lasted about an hour on average. Source: A study 2023. Your street may be on a different line, so yours can differ.",
      tone: "hot", url: "https://example.org/s",
    });
  });
  it("gives the typical Kampala range where no study applies", () => {
    expect(cutsLine(data, ELSEWHERE)?.text).toBe("No study covers this area. Across Kampala, utility records show the average customer losing power 3 to 6 times a month, 4 to 6 hours in all, with a cut lasting 1 to 1.5 hours on average (East network, 2022; Kitala line, 2024). It depends on the power line a building is on.");
    const t = typical(data)!;
    expect(t.hoursPerWeek).toBeCloseTo(((6.26 + 4.48) / 2) / (52 / 12), 6);
    expect(t.cutsPerMonth).toEqual([2.85, 5.5]);
  });
  it("fills in hours a week for the calculator, and the length of a typical cut", () => {
    expect(hoursAt(data, EAST)?.hours).toBeCloseTo(6.26 / (52 / 12), 6);
    expect(hoursAt(data, EAST)?.from).toBe("East network, 2022, from utility records");
    expect(hoursAt(data, ELSEWHERE)?.from).toBe("typical for Kampala, from utility records");
    expect(cutLengthAt(data, KITALA)).toBe(1.57);
    expect(cutLengthAt(data, null)).toBeCloseTo((1.14 + 1.57) / 2, 6);
  });
  it("says nothing measured when there are no studies", () => {
    const none = { ...data, published: data.published.filter((p) => p.basis !== "measured") };
    expect(cutsLine(none, EAST)).toBeNull();
    expect(hoursAt(none, EAST)).toBeNull();
  });
});

describe("news and complaints", () => {
  it("quotes a news figure inside its radius", () => {
    const n = newsNear(data, NAJJERA);
    expect(n.map((p) => p.label)).toEqual(["Kiwatule and Najjera"]);
    expect(newsSentence(n[0]!)).toBe("Up to 13 cuts a month in Kiwatule and Najjera, Aug 2019 to Oct 2019 (A newspaper, 2019).");
    expect(newsNear(data, ELSEWHERE)).toEqual([]);
  });
  it("shows complaints as complaints, never as a rate", () => {
    expect(reportsLine(data, NAJJERA)).toBe("Cuts reported in Najjera on 8 days (Nov 2019 to Aug 2024). These are complaints someone found, not every cut in that time.");
    expect(reportsLine(data, ELSEWHERE)).toBeNull();
  });
});

describe("words", () => {
  it("reads durations and days naturally", () => {
    expect([0.4, 1.14, 1.57, 2.2].map(duration)).toEqual(["about 25 minutes", "about an hour", "about 1.5 hours", "about 2 hours"]);
    expect([0.5, 1.2, 2.6, 7].map(daysAWeek)).toEqual(["about one day every 2 weeks", "about one day a week", "about 2.5 days a week", "every day"]);
  });
});

describe("planned cuts and timing", () => {
  it("lists only cuts from today on, nearby", () => {
    const p = plannedNear(data, NAJJERA, "2026-11-19");
    expect(p.map((x) => x.date)).toEqual(["2026-11-29"]);
    expect(plannedSentence(p[0]!)).toBe("Planned cut Sun 29 Nov, 07:00–18:00, in Najjera (UEDCL notice).");
  });
  it("knows the date in Kampala (UTC+3)", () => {
    expect(kampalaToday(new Date("2026-11-19T22:30:00Z"))).toBe("2026-11-20");
  });
  it("gives the evening share only with enough timed complaints", () => {
    expect(eveningShare(data)).toEqual({ n: 34, evening: 17 / 34 });
    expect(eveningShare({ ...data, reported_hours: [1, 2] })).toBeNull();
  });
});
