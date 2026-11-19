import { describe, expect, it } from "vitest";
import { nearest, thinPlaces, type Place } from "./places";

// Made-up places for the tests only.
const P = (name: string, rank: number, x: number, y: number): Place => ({ name, kind: "town", rank, lat: y, lon: x });

describe("nearest place", () => {
  const places = [P("A", 3, 32.58, 0.31), P("B", 3, 32.6, 0.33)];
  it("finds the closest within range", () => {
    const n = nearest(places, 0.312, 32.581);
    expect(n?.place.name).toBe("A");
    expect(n?.km).toBeLessThan(0.3);
  });
  it("returns nothing when all are far", () => {
    expect(nearest(places, 1.5, 33.5)).toBeNull();
  });
});

describe("thinning labels", () => {
  it("keeps bigger places and drops close neighbours", () => {
    const ps = [P("Village", 4, 32.5801, 0.3101), P("Town", 2, 32.58, 0.31), P("Far", 5, 32.6, 0.33)];
    expect(thinPlaces(ps).map((p) => p.name)).toEqual(["Town", "Far"]);
    expect(thinPlaces(ps, 0.4, 1).map((p) => p.name)).toEqual(["Town"]);
  });
});
