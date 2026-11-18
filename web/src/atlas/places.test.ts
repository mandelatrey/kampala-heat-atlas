import { describe, expect, it } from "vitest";
import { chooseLabels, nearest, type Place } from "./places";

// Made-up places for the tests only.
const P = (name: string, rank: number, x: number, y: number): Place => ({ name, kind: "town", rank, lat: y, lon: x });
const screen = (p: Place): [number, number] => [p.lon, p.lat];
const view = { w: 800, h: 600 };

describe("choosing labels", () => {
  it("shows more ranks as you zoom in", () => {
    const places = [P("City", 1, 100, 100), P("Town", 2, 400, 100), P("Suburb", 3, 400, 400), P("Quarter", 5, 100, 400)];
    expect(chooseLabels(places, -2, screen, view).map((p) => p.name)).toEqual(["City"]);
    expect(chooseLabels(places, -1, screen, view).map((p) => p.name)).toEqual(["City", "Town"]);
    expect(chooseLabels(places, 1, screen, view).map((p) => p.name)).toEqual(["City", "Town", "Suburb", "Quarter"]);
  });
  it("drops a lower-ranked label that would overlap a better one", () => {
    const places = [P("Neighbourhood", 5, 205, 102), P("Big city", 1, 200, 100)];
    expect(chooseLabels(places, 2, screen, view).map((p) => p.name)).toEqual(["Big city"]);
  });
  it("skips places off screen", () => {
    expect(chooseLabels([P("Far", 1, 5000, 100)], 0, screen, view)).toEqual([]);
  });
});

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
