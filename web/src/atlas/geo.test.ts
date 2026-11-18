import { describe, expect, it } from "vitest";
import { formatLatLon, fromUtm, gridProjection, niceScale, toUtm, utmZone } from "./geo";

// [lat, lon, easting, northing] from pyproj (EPSG:4326 -> EPSG:32636)
const REF: [number, number, number, number][] = [
  [0.3136, 32.5811, 453387.193, 34663.159],
  [0.1, 32.35, 427669.822, 11053.721],
  [0.55, 32.85, 483309.5, 60791.754],
  [-0.5, 33.5, 555636.088, -55267.156],
  [0.0, 33.0, 500000.0, 0.0],
];

describe("UTM", () => {
  it("reads the zone from the CRS", () => {
    expect(utmZone("EPSG:32636")).toEqual({ zone: 36, south: false });
    expect(utmZone("EPSG:32736")).toEqual({ zone: 36, south: true });
    expect(() => utmZone("EPSG:4326")).toThrow();
  });
  it("matches pyproj to the millimetre", () => {
    for (const [lat, lon, x, y] of REF) {
      const [ex, ny] = toUtm(lat, lon, 36);
      expect(ex).toBeCloseTo(x, 2);
      expect(ny).toBeCloseTo(y, 2);
    }
  });
  it("round-trips", () => {
    for (const [lat, lon, x, y] of REF) {
      const [la, lo] = fromUtm(x, y, 36);
      expect(la).toBeCloseTo(lat, 7);
      expect(lo).toBeCloseTo(lon, 7);
    }
  });
});

describe("atlas grid", () => {
  const proj = gridProjection({ crs: "EPSG:32636", origin: [427650, 60810], pixel: 30 }, 1659);
  it("puts the grid's corners on the map's corners", () => {
    const [lat, lon] = proj.toLatLon(1659, 0); // top-left of the image
    const [y, x] = proj.toMap(lat, lon);
    expect(y).toBeCloseTo(1659, 6);
    expect(x).toBeCloseTo(0, 6);
  });
  it("puts central Kampala in the middle of the study area", () => {
    const [y, x] = proj.toMap(0.3136, 32.5811);
    expect(x / 1856).toBeGreaterThan(0.4);
    expect(x / 1856).toBeLessThan(0.5);
    expect(y / 1659).toBeGreaterThan(0.4);
    expect(y / 1659).toBeLessThan(0.55);
  });
  it("formats coordinates and scale bars", () => {
    expect(formatLatLon(0.31361, 32.58114)).toBe("0.3136° N, 32.5811° E");
    expect(formatLatLon(-1.2864, 36.8172)).toBe("1.2864° S, 36.8172° E");
    expect(niceScale(3400)).toEqual({ metres: 2000, label: "2 km" });
    expect(niceScale(740)).toEqual({ metres: 500, label: "500 m" });
    expect(niceScale(10000)).toEqual({ metres: 10000, label: "10 km" });
  });
});
