import { describe, expect, it } from "vitest";
import { indexBuildings, inside, pickBuilding } from "./pick";
import type { Building } from "./types";

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const b = (x: number, y: number, h: number): Building => ({ p: square(x, y, 0.0001), h, kwh: null, loss: null, pen: 0 });

describe("building hit test", () => {
  it("tests points against footprints", () => {
    expect(inside([0.00005, 0.00005], square(0, 0, 0.0001))).toBe(true);
    expect(inside([0.0002, 0.00005], square(0, 0, 0.0001))).toBe(false);
  });

  it("hits the first building along a sloping line of sight", () => {
    // a tall building in front (to the south) and a low one behind; the sight line drops northwards
    const tall = b(0, 0, 30);
    const low = b(0, 0.0003, 5);
    const index = indexBuildings([low, tall]);
    // over the tall one's roof height the sight line is already north of it, so it lands on the low one
    const passesOver = (z: number): [number, number] => [0.00005, 0.00042 - z * 0.00001];
    expect(pickBuilding(index, passesOver)).toBe(0);
    // this one is above the tall roof at 30 m, so it hits the tall building first
    const hitsTall = (z: number): [number, number] => [0.00005, 0.00005 + (30 - z) * 0.00002];
    expect(pickBuilding(index, hitsTall)).toBe(1);
  });

  it("misses when the line of sight only meets open ground", () => {
    const index = indexBuildings([b(0, 0, 10)]);
    expect(pickBuilding(index, () => [0.01, 0.01])).toBe(-1);
  });
});
