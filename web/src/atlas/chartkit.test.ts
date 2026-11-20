import { describe, expect, it } from "vitest";
import { niceDomain, niceTicks, spreadLabels } from "./chartkit";
import { num, pctChange, pctRange, range, signed, thousands } from "./stats";

describe("axis ticks", () => {
  it("are round numbers covering the range", () => {
    expect(niceTicks(0, 1000)).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(niceTicks(-2.2, 7.5, 5)).toEqual([-2, 0, 2, 4, 6]);
    expect(niceTicks(0, 33.4, 5)).toEqual([0, 10, 20, 30]);
  });
  it("give a domain that starts and ends on a tick", () => {
    expect(niceDomain(0, 934.9)).toEqual([0, 1000]);
    expect(niceDomain(-2.23, 7.53, 6)).toEqual([-4, 8]);
  });
});

describe("label spreading", () => {
  it("keeps labels at least a gap apart, in order", () => {
    const out = spreadLabels([100, 104, 300, 102], 15);
    expect(out[0]).toBe(100);
    expect(out[3]).toBe(115);
    expect(out[1]).toBe(130);
    expect(out[2]).toBe(300);
  });
  it("pushes back up from the bottom edge", () => {
    expect(spreadLabels([195, 198], 15, 0, 200)).toEqual([185, 200]);
  });
});

describe("number formatting", () => {
  it("rounds with thousands separators and a real minus", () => {
    expect(num(33366.87)).toBe("33,367");
    expect(num(-2.1975, 1)).toBe("−2.2");
    expect(num(-0.04, 1)).toBe("0.0");
  });
  it("signs and ranges", () => {
    expect(signed(1.0396)).toBe("+1.0");
    expect(signed(-0.72)).toBe("−0.7");
    expect(range([0.7825, 0.8005], 2)).toBe("0.78–0.80");
    expect(range([5.51, 5.81], 0)).toBe("6");
    expect(pctRange([0.208, 0.2899])).toBe("21–29");
    expect(pctChange(657.78, 909.3)).toBe("+38");
    expect(thousands(319277.7)).toBe("319,000");
  });
});
