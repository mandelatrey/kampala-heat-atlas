import { describe, expect, it } from "vitest";
import { formatLatLon, fromUtm, gridGeo, toUtm, utmZone } from "./geo";

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
  const H = 1659, W = 1856;
  const geo = gridGeo({ crs: "EPSG:32636", origin: [427650, 60810], pixel: 30 }, H, W);
  it("finds the cell under a point and back", () => {
    const [lat, lon] = geo.latLonAt(100.5, 200.5);
    const [r, c] = geo.cellAt(lat, lon);
    expect(r).toBeCloseTo(100.5, 6);
    expect(c).toBeCloseTo(200.5, 6);
  });
  it("puts central Kampala in the middle of the study area", () => {
    const [r, c] = geo.cellAt(0.3136, 32.5811);
    expect(c / W).toBeGreaterThan(0.4);
    expect(c / W).toBeLessThan(0.5);
    expect(r / H).toBeGreaterThan(0.45);
    expect(r / H).toBeLessThan(0.6);
  });
  it("stretching the grid over its lat/lon bounds misplaces no cell by more than 10 m", () => {
    const [[s, w], [n, e]] = geo.bounds;
    let worst = 0;
    for (let r = 0; r <= H; r += H / 8) {
      for (let c = 0; c <= W; c += W / 8) {
        const [lat, lon] = geo.latLonAt(r, c);
        const dLat = lat - (n - (r / H) * (n - s));
        const dLon = lon - (w + (c / W) * (e - w));
        worst = Math.max(worst, Math.hypot(dLat * 110574, dLon * 111320 * Math.cos((lat * Math.PI) / 180)));
      }
    }
    expect(worst).toBeLessThan(10);
  });
  it("formats coordinates", () => {
    expect(formatLatLon(0.31361, 32.58114)).toBe("0.3136° N, 32.5811° E");
    expect(formatLatLon(-1.2864, 36.8172)).toBe("1.2864° S, 36.8172° E");
  });
});
