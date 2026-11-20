import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOAD, monthlyBill, PRICES, solarResult, suggestedKwp, SUN, typicalDay, unitsForBill, type Inputs, type Tariffs } from "./solar";

// The committed tariff file, so a quarterly edit that breaks its shape fails here.
const t = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../docs/power/tariffs.json"), "utf-8")) as Tariffs;

describe("the tariff file", () => {
  it("has the prices the calculator reads", () => {
    expect(t.domestic.energy).toBeGreaterThan(0);
    expect(t.domestic.lifeline.units).toBeGreaterThan(0);
    expect(t.domestic.cooking.to).toBeGreaterThan(t.domestic.cooking.from);
    expect(t.commercial.energy).toBeGreaterThan(0);
    expect(t.quarter).toMatch(/^\d{4}-Q[1-4]$/);
  });
});

// Made-up round prices for the arithmetic tests.
const T: Tariffs = {
  quarter: "2026-Q4", valid: "", source: "", url: "",
  domestic: { energy: 800, lifeline: { units: 15, price: 250, max_monthly_average: 100 }, cooking: { from: 81, to: 150, price: 400 } },
  commercial: { energy: 500 },
};

describe("monthly bill", () => {
  it("gives a small home the lifeline price for its first units", () => {
    expect(monthlyBill(10, "home", T)).toBe(10 * 250);
    expect(monthlyBill(100, "home", T)).toBe(15 * 250 + 85 * 800);
  });
  it("charges a bigger home the full price for every unit", () => {
    expect(monthlyBill(101, "home", T)).toBe(101 * 800);
  });
  it("applies the cooking band from unit 81 to 150 when registered", () => {
    expect(monthlyBill(200, "home", T, true)).toBe(80 * 800 + 70 * 400 + 50 * 800);
    expect(monthlyBill(90, "home", T, true)).toBe(15 * 250 + 65 * 800 + 10 * 400);
  });
  it("charges businesses one price", () => {
    expect(monthlyBill(300, "business", T)).toBe(300 * 500);
  });
  it("turns a bill back into units", () => {
    for (const u of [12, 60, 100, 140, 400]) expect(unitsForBill(monthlyBill(u, "home", T), "home", T)).toBe(u);
    expect(unitsForBill(0, "home", T)).toBe(0);
  });
});

describe("a typical day", () => {
  it("has the sun's output summing to one and daylight only", () => {
    expect(SUN.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(SUN[3]).toBe(0);
    expect(SUN[21]).toBe(0);
    expect(SUN.indexOf(Math.max(...SUN))).toBe(12);
  });
  it("has load shapes averaging one, homes peaking at night and businesses by day", () => {
    for (const s of Object.values(LOAD)) expect(s.reduce((a, b) => a + b, 0) / 24).toBeCloseTo(1, 10);
    expect(LOAD.home.indexOf(Math.max(...LOAD.home))).toBe(20);
    expect(LOAD.business.indexOf(Math.max(...LOAD.business))).toBe(13);
  });
  it("splits the output into used and spare, and a battery uses more of it", () => {
    const plain = typicalDay(2, 1500, 150, "home", 0);
    expect(plain.used + plain.spare).toBeCloseTo(plain.made, 6);
    expect(plain.made).toBeCloseTo((2 * 1500) / 365, 6);
    const stored = typicalDay(2, 1500, 150, "home", 4);
    expect(stored.used).toBeGreaterThan(plain.used);
    expect(stored.used + stored.spare).toBeLessThanOrEqual(stored.made + 1e-9);   // battery losses
  });
  it("never uses more than the building needs", () => {
    const big = typicalDay(20, 1500, 60, "home", 0);
    expect(big.used).toBeLessThanOrEqual((60 * 12) / 365 + 1e-9);
  });
});

const base: Inputs = {
  who: "home", unitsPerMonth: 150, cooking: false, kwp: 1, batteryKwh: 0, cutHoursPerWeek: 0, generator: false,
  pricePerKwp: PRICES.panelsPerKwp.home, pricePerBatteryKwh: PRICES.batteryPerKwh, yieldKwhPerKwp: 1516,
};

describe("the result", () => {
  it("works out payback from the units saved, the price and upkeep", () => {
    // a big home stays on the full price, so every unit saved is worth the domestic price
    const r = solarResult({ ...base, unitsPerMonth: 400 }, t);
    const yearly = r.usedPerMonth * t.domestic.energy * 12 - PRICES.panelsPerKwp.home * PRICES.upkeepShare;
    expect(r.paybackYears).toBeCloseTo(PRICES.panelsPerKwp.home / yearly, 6);
    expect(r.billBefore - r.billAfter).toBeCloseTo(r.usedPerMonth * t.domestic.energy, 6);
    expect(r.lifelineAfter).toBe(false);
  });
  it("notices when solar brings a home under the lifeline limit", () => {
    const r = solarResult(base, t);                // 150 units, about 70 of them from the panels
    expect(r.lifelineAfter).toBe(true);
    expect(r.billAfter).toBeCloseTo(monthlyBill(150 - r.usedPerMonth, "home", t), 6);
  });
  it("pays back faster for a business that uses power by day", () => {
    const home = solarResult({ ...base, kwp: 3, unitsPerMonth: 600 }, t);
    const shop = solarResult({ ...base, who: "business", kwp: 3, unitsPerMonth: 600, pricePerKwp: PRICES.panelsPerKwp.business }, t);
    expect(shop.usedShare).toBeGreaterThan(home.usedShare);
    expect(shop.paybackYears!).toBeLessThan(home.paybackYears!);
  });
  it("says a battery bridges cuts, and saves generator fuel only when there is a generator", () => {
    const r = solarResult({ ...base, batteryKwh: 2, cutHoursPerWeek: 10 }, t);
    expect(r.cutCoverHours).toBeCloseTo((2 * 0.9 * 0.95) / 0.25, 6);
    expect(r.coveredHoursPerWeek).toBe(10);
    expect(r.fuelSavedPerMonth).toEqual([0, 0]);
    const g = solarResult({ ...base, batteryKwh: 2, cutHoursPerWeek: 10, generator: true }, t);
    expect(g.fuelSavedPerMonth[0]).toBeGreaterThan(0);
    expect(g.paybackYears!).toBeLessThan(solarResult({ ...base, batteryKwh: 2, cutHoursPerWeek: 10 }, t).paybackYears ?? Infinity);
  });
  it("caps the cut hours a battery can bridge at one full battery a day", () => {
    const r = solarResult({ ...base, batteryKwh: 1, cutHoursPerWeek: 60 }, t);
    expect(r.coveredHoursPerWeek).toBeCloseTo(7 * r.cutCoverHours, 6);
  });
  it("reports no payback when savings do not cover upkeep", () => {
    expect(solarResult({ ...base, unitsPerMonth: 5, kwp: 5 }, t).paybackYears).toBeNull();
  });
});

describe("suggested size", () => {
  it("grows with use and stays where most of the output is used", () => {
    const small = suggestedKwp(100, "home", 1516), large = suggestedKwp(600, "home", 1516);
    expect(large).toBeGreaterThan(small);
    const d = typicalDay(large, 1516, 600, "home", 0);
    expect(d.used / d.made).toBeGreaterThanOrEqual(0.7);
  });
});
