// Between latitude/longitude (WGS84) and the atlas grid (UTM, a 30 m pixel grid), so the map can place
// names and say where the cursor is. Transverse Mercator by the Krüger series (Karney 2011), accurate to
// well under a millimetre this close to the central meridian.

const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const FALSE_E = 500000;

const n = F / (2 - F);
const A_ = (A / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);
const ALPHA = [
  n / 2 - (2 / 3) * n ** 2 + (5 / 16) * n ** 3,
  (13 / 48) * n ** 2 - (3 / 5) * n ** 3,
  (61 / 240) * n ** 3,
];
const BETA = [
  n / 2 - (2 / 3) * n ** 2 + (37 / 96) * n ** 3,
  (1 / 48) * n ** 2 + (1 / 15) * n ** 3,
  (17 / 480) * n ** 3,
];
const DELTA = [
  2 * n - (2 / 3) * n ** 2 - 2 * n ** 3,
  (7 / 3) * n ** 2 - (8 / 5) * n ** 3,
  (56 / 15) * n ** 3,
];
const E2 = F * (2 - F);
const deg = Math.PI / 180;

/** UTM zone number and hemisphere from an EPSG code such as "EPSG:32636" (WGS84 / UTM 36N). */
export function utmZone(crs: string): { zone: number; south: boolean } {
  const code = /^EPSG:\d{5}$/.test(crs) ? Number(crs.slice(5)) : NaN;
  if (!((code >= 32601 && code <= 32660) || (code >= 32701 && code <= 32760))) throw new Error(`not a WGS84 UTM CRS: ${crs}`);
  return { zone: code % 100, south: code >= 32700 };
}

/** [easting, northing] in metres. */
export function toUtm(lat: number, lon: number, zone: number, south = false): [number, number] {
  const lon0 = (zone * 6 - 183) * deg;
  const phi = lat * deg;
  const lam = lon * deg - lon0;
  const e = Math.sqrt(E2);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
  const xi1 = Math.atan2(t, Math.cos(lam));
  const eta1 = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let xi = xi1, eta = eta1;
  ALPHA.forEach((a, j) => {
    const k = 2 * (j + 1);
    xi += a * Math.sin(k * xi1) * Math.cosh(k * eta1);
    eta += a * Math.cos(k * xi1) * Math.sinh(k * eta1);
  });
  return [FALSE_E + K0 * A_ * eta, (south ? 10000000 : 0) + K0 * A_ * xi];
}

/** [lat, lon] in degrees. */
export function fromUtm(x: number, y: number, zone: number, south = false): [number, number] {
  const lon0 = (zone * 6 - 183) * deg;
  const xi = (y - (south ? 10000000 : 0)) / (K0 * A_);
  const eta = (x - FALSE_E) / (K0 * A_);
  let xi1 = xi, eta1 = eta;
  BETA.forEach((b, j) => {
    const k = 2 * (j + 1);
    xi1 -= b * Math.sin(k * xi) * Math.cosh(k * eta);
    eta1 -= b * Math.cos(k * xi) * Math.sinh(k * eta);
  });
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  let phi = chi;
  DELTA.forEach((d, j) => {
    phi += d * Math.sin(2 * (j + 1) * chi);
  });
  return [phi / deg, (lon0 + Math.atan2(Math.sinh(eta1), Math.cos(xi1))) / deg];
}

export interface Grid {
  crs: string;
  /** Top-left corner of pixel (0, 0), [x, y] in crs metres. */
  origin: [number, number];
  /** Pixel size, metres. */
  pixel: number;
}

/**
 * The map's coordinates: Leaflet CRS.Simple with the image spanning [[0, 0], [H, W]], so a point's
 * "lat" is H minus its row and its "lng" is its column.
 */
export function gridProjection(grid: Grid, height: number) {
  const { zone, south } = utmZone(grid.crs);
  return {
    /** [lat, lon] -> map [y, x] */
    toMap(lat: number, lon: number): [number, number] {
      const [x, y] = toUtm(lat, lon, zone, south);
      return [height - (grid.origin[1] - y) / grid.pixel, (x - grid.origin[0]) / grid.pixel];
    },
    /** map [y, x] -> [lat, lon] */
    toLatLon(my: number, mx: number): [number, number] {
      return fromUtm(grid.origin[0] + mx * grid.pixel, grid.origin[1] - (height - my) * grid.pixel, zone, south);
    },
    /** metres per map unit */
    metresPerUnit: grid.pixel,
  };
}

/** "0.3136° N, 32.5811° E" */
export function formatLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
}

/** A round scale-bar length (1, 2, 5 × 10^k metres) that fits in maxMetres, and its label. */
export function niceScale(maxMetres: number): { metres: number; label: string } {
  const p = 10 ** Math.floor(Math.log10(maxMetres));
  const m = [5, 2, 1].map((s) => s * p).find((v) => v <= maxMetres) ?? p;
  return { metres: m, label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
}
