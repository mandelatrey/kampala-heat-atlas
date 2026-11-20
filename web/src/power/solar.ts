// Rooftop solar for one building: what panels make, how much of it the building can use, what that saves on the
// electricity bill, how long the system takes to pay back, and what a battery keeps running in a power cut.
// Follows the thesis model in scripts/23_solar_grid.py (load shapes, battery dispatch, research prices, no payment
// for power sent to the grid), worked for one typical day instead of twelve months: at 0.3° N the seasons barely
// change how much sun there is.

/** docs/power/tariffs.json: ERA's end-user prices, updated every quarter. */
export interface Tariffs {
  quarter: string;
  valid: string;
  source: string;
  url: string;
  domestic: {
    energy: number;
    lifeline: { units: number; price: number; max_monthly_average: number };
    cooking: { from: number; to: number; price: number };
  };
  commercial: { energy: number };
}

export type Building = "home" | "business";

/** Monthly bill in UGX for `units` kWh. A home on 100 units or less a month gets the lifeline price for its first units. */
export function monthlyBill(units: number, who: Building, t: Tariffs, cooking = false): number {
  const u = Math.max(0, units);
  if (who === "business") return u * t.commercial.energy;
  const d = t.domestic;
  let bill = 0;
  let rest = u;
  if (u <= d.lifeline.max_monthly_average) {
    const low = Math.min(rest, d.lifeline.units);
    bill += low * d.lifeline.price;
    rest -= low;
  }
  if (cooking) {
    // units from..to (1-based, inclusive) at the cooking price
    const before = u - rest;                                  // units already billed
    const start = Math.max(before, d.cooking.from - 1);
    const inBand = Math.max(0, Math.min(u, d.cooking.to) - start);
    bill += inBand * d.cooking.price;
    rest -= inBand;
  }
  return bill + rest * d.energy;
}

/** The units a monthly bill buys (inverse of monthlyBill, to the nearest unit). */
export function unitsForBill(bill: number, who: Building, t: Tariffs, cooking = false): number {
  let lo = 0, hi = 20000;
  if (bill <= 0) return 0;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (monthlyBill(mid, who, t, cooking) < bill) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

// ---- a typical day, hour by hour

const H = Array.from({ length: 24 }, (_, h) => h);

/** Share of a day's solar output in each hour. Kampala's solar noon is about 12:50 local time, with about 12 h of sun. */
export const SUN: number[] = (() => {
  const raw = H.map((h) => Math.max(0, Math.sin((Math.PI * (h + 0.5 - 6.83)) / 12)));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / sum);
})();

const norm = (v: number[]) => {
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return v.map((x) => x / mean);
};
/** Electricity use through the day, mean 1 (scripts/23_solar_grid.py): homes peak in the evening, businesses by day. */
export const LOAD: Record<Building, number[]> = {
  home: norm(H.map((h) => 0.7 + 0.3 * Math.min(Math.max((h - 5) / 4, 0), 1) - 0.05 * Math.exp(-(((h - 14) / 3) ** 2)) + 0.38 * Math.exp(-(((h - 20) / 1.6) ** 2)))),
  business: norm(H.map((h) => 0.7 + 0.5 * Math.exp(-(((h - 13) / 3.6) ** 2)) + 0.3 * Math.exp(-(((h - 20) / 2) ** 2)))),
};

const EFF = 0.95;           // battery, each way
const BATTERY_HOURS = 2;    // a battery charges or discharges fully in about 2 h

/** kWh a day: made by the panels, used directly or via the battery, and left over (unused: Uganda pays nothing for it). */
export function typicalDay(kwp: number, yieldKwhPerKwp: number, unitsPerMonth: number, who: Building, batteryKwh: number) {
  const pv = SUN.map((s) => (s * kwp * yieldKwhPerKwp) / 365);
  const load = LOAD[who].map((l) => (l * unitsPerMonth * 12) / 365 / 24);
  const rate = batteryKwh / BATTERY_HOURS;
  let soc = 0;
  let used = 0, spare = 0;
  for (let pass = 0; pass < 2; pass++) {               // the second day starts with what the first left in the battery
    used = 0;
    spare = 0;
    for (const h of H) {
      let direct = Math.min(pv[h]!, load[h]!);
      let surplus = pv[h]! - direct;
      const deficit = load[h]! - direct;
      if (batteryKwh > 0) {
        const charge = Math.min(surplus, rate, (batteryKwh - soc) / EFF);
        soc += charge * EFF;
        surplus -= charge;
        const out = Math.min(deficit, rate, soc * EFF);
        soc -= out / EFF;
        direct += out;
      }
      used += direct;
      spare += surplus;
    }
  }
  return { made: pv.reduce((a, b) => a + b, 0), used, spare };
}

// ---- prices and the result

/** Research assumptions (scripts/23_solar_grid.py), at 3,700 UGX per US$; people can change them. */
export const PRICES = {
  ugxPerUsd: 3700,
  panelsPerKwp: { home: 1100 * 3700, business: 750 * 3700 },   // panels, inverter, mounting, installation
  batteryPerKwh: 350 * 3700,
  upkeepShare: 0.015,                                          // of the system price, each year
  /** Diesel or petrol back-up, per kWh (US$0.35-0.47). */
  generatorPerKwh: [0.35 * 3700, 0.47 * 3700] as [number, number],
};

/** Lights, phones, a fan and a fridge: what a household keeps running in a cut, kW on average. */
export const ESSENTIALS_KW = { home: 0.25, business: 0.6 };

export interface Inputs {
  who: Building;
  unitsPerMonth: number;
  cooking: boolean;
  kwp: number;
  batteryKwh: number;
  /** Hours a week without grid power. */
  cutHoursPerWeek: number;
  /** Runs a generator in cuts today (so a battery saves fuel). */
  generator: boolean;
  pricePerKwp: number;
  pricePerBatteryKwh: number;
  yieldKwhPerKwp: number;
}

export interface Result {
  madePerMonth: number;
  usedPerMonth: number;
  /** Share of the panels' output the building uses. */
  usedShare: number;
  /** Share of the building's electricity the panels cover. */
  coverShare: number;
  billBefore: number;
  billAfter: number;
  /** Solar brings a home under the lifeline limit (after six months at that level, the first units get the lifeline price). */
  lifelineAfter: boolean;
  savingPerMonth: number;
  cost: number;
  upkeepPerYear: number;
  /** Simple payback (cost / yearly net saving), or null when savings do not cover upkeep. */
  paybackYears: number | null;
  /** Hours the battery runs the essentials in one cut (0 without a battery). */
  cutCoverHours: number;
  /** Of the week's cut hours, how many the battery can bridge (it refills from the panels once a day). */
  coveredHoursPerWeek: number;
  /** Generator fuel a month that the battery replaces, [low, high] UGX (0 when no generator or no cuts). */
  fuelSavedPerMonth: [number, number];
}

const WEEKS_PER_MONTH = 52 / 12;

export function solarResult(x: Inputs, t: Tariffs): Result {
  const day = typicalDay(x.kwp, x.yieldKwhPerKwp, x.unitsPerMonth, x.who, x.batteryKwh);
  const perMonth = 365 / 12;
  const madePerMonth = day.made * perMonth;
  const usedPerMonth = Math.min(day.used * perMonth, x.unitsPerMonth);
  const billBefore = monthlyBill(x.unitsPerMonth, x.who, t, x.cooking);
  const billAfter = monthlyBill(x.unitsPerMonth - usedPerMonth, x.who, t, x.cooking);
  const cost = x.kwp * x.pricePerKwp + x.batteryKwh * x.pricePerBatteryKwh;
  const upkeepPerYear = cost * PRICES.upkeepShare;

  // power cuts: one full battery (less a 10 % reserve) runs the essentials; it refills from the panels once a day
  const essentials = ESSENTIALS_KW[x.who];
  const cutCoverHours = x.batteryKwh > 0 ? (x.batteryKwh * 0.9 * EFF) / essentials : 0;
  const coveredHoursPerWeek = Math.min(Math.max(0, x.cutHoursPerWeek), 7 * cutCoverHours);
  const coveredKwhPerMonth = coveredHoursPerWeek * WEEKS_PER_MONTH * essentials;
  const fuelSavedPerMonth: [number, number] = x.generator
    ? [coveredKwhPerMonth * PRICES.generatorPerKwh[0], coveredKwhPerMonth * PRICES.generatorPerKwh[1]] : [0, 0];

  // payback counts the bill saving and, with a generator, the lower fuel estimate
  const net = (billBefore - billAfter + fuelSavedPerMonth[0]) * 12 - upkeepPerYear;
  return {
    madePerMonth, usedPerMonth,
    usedShare: madePerMonth > 0 ? usedPerMonth / madePerMonth : 0,
    coverShare: x.unitsPerMonth > 0 ? usedPerMonth / x.unitsPerMonth : 0,
    billBefore, billAfter, savingPerMonth: billBefore - billAfter, cost, upkeepPerYear,
    lifelineAfter: x.who === "home" && x.unitsPerMonth > t.domestic.lifeline.max_monthly_average
      && x.unitsPerMonth - usedPerMonth <= t.domestic.lifeline.max_monthly_average,
    paybackYears: cost > 0 && net > 0 ? cost / net : null,
    cutCoverHours, coveredHoursPerWeek, fuelSavedPerMonth,
  };
}

/** A panel size that covers most daytime use without much going to waste: the size where about 70 % of the output is used. */
export function suggestedKwp(unitsPerMonth: number, who: Building, yieldKwhPerKwp: number): number {
  let best = 0.5;
  for (let k = 0.5; k <= 20; k += 0.5) {
    const d = typicalDay(k, yieldKwhPerKwp, unitsPerMonth, who, 0);
    if (d.made > 0 && d.used / d.made >= 0.7) best = k;
    else break;
  }
  return best;
}
