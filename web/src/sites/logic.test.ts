import { describe, expect, it } from "vitest";
import type { DayBriefing, TradeRow } from "../types";
import { hourShares, limitTone, scale, shareTone, sky, statusTone, stormAlert, weekSummary, workableShare } from "./logic";

const row = (key: TradeRow["key"], hours: [number, 0 | 1 | 2][]): TradeRow => ({
  key, trade: key, status: "LIMITED", label: "", go_hours: hours.filter(([, s]) => s === 0).length,
  windows: "", causes: [], action: "", hours,
});

const day = (name: string, storm: "likely" | "possible" | "low", rows: TradeRow[], extra: Partial<DayBriefing["facts"]> = {}): DayBriefing => ({
  date: "2026-11-18", day: name, headline: "", extras: [], rows,
  facts: { rain_mm: 0, rain_chance: 0, storm, storm_from: "", wbgt_peak: 24, gust_hook_max: 5, go_hours: {} as DayBriefing["facts"]["go_hours"], ...extra },
});

const rows = [row("concrete", [[8, 0], [9, 0], [10, 2]]), row("crane", [[8, 0], [9, 1], [10, 2]])];

describe("site-weather summaries", () => {
  it("maps statuses to tones", () => {
    expect(statusTone("GO")).toBe("good");
    expect(statusTone("CAUTION")).toBe("warning");
    expect(statusTone("LIMITED")).toBe("warning");
    expect(statusTone("STOP")).toBe("critical");
  });

  it("counts trades that can work each hour", () => {
    expect(hourShares(rows)).toEqual([{ hour: 8, go: 2, total: 2 }, { hour: 9, go: 1, total: 2 }, { hour: 10, go: 0, total: 2 }]);
    expect(hourShares(rows).map(shareTone)).toEqual(["good", "warning", "critical"]);
  });

  it("measures the workable share of trade-hours", () => {
    expect(workableShare(day("Wednesday 18 November", "low", rows))).toBeCloseTo(3 / 6);
    expect(workableShare(day("Wednesday 18 November", "low", []))).toBe(0);
  });

  it("summarises the week", () => {
    const good = [row("concrete", [[8, 0], [9, 0], [10, 0]])];
    const week = [day("Wednesday 18", "possible", rows), day("Thursday 19", "likely", rows), day("Friday 20", "low", good), day("Saturday 21", "likely", rows)];
    expect(weekSummary(week)).toBe("Storms likely Thu and Sat · best day Fri");
    expect(weekSummary([day("Monday 1", "low", rows)])).toBe("No storm risk this week · best day Mon");
    expect(weekSummary([day("Monday 1", "possible", rows), day("Tuesday 2", "possible", rows)])).toMatch(/^Storms possible on 2 days/);
  });

  it("points at the next storm day that is not on screen", () => {
    const week = [day("a", "likely", rows), day("b", "low", rows), day("c", "likely", rows)];
    expect(stormAlert(week, 0)).toBe(2);
    expect(stormAlert(week, 1)).toBe(0);
    expect(stormAlert([day("a", "low", rows)], 0)).toBe(-1);
  });

  it("picks the hero mood", () => {
    expect(sky(day("a", "likely", rows, { wbgt_peak: 30 }))).toBe("storm");
    expect(sky(day("a", "low", rows, { wbgt_peak: 29 }))).toBe("heat");
    expect(sky(day("a", "low", rows, { rain_mm: 6 }))).toBe("wet");
    expect(sky(day("a", "low", rows))).toBe("clear");
  });

  it("rates a value against its limits", () => {
    expect(limitTone(14, 15, 20)).toBe("good");
    expect(limitTone(15, 15, 20)).toBe("warning");
    expect(limitTone(21, 15, 20)).toBe("critical");
    expect(scale(5, 0, 10)).toBe(0.5);
    expect(scale(-5, 0, 10)).toBe(0);
    expect(scale(50, 0, 10)).toBe(1);
  });
});
