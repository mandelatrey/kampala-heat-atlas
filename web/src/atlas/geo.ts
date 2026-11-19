// Between latitude/longitude (WGS84) and the atlas grid (UTM, a 30 m pixel grid), so the map can place
// the layers and read the cell under the cursor. Transverse Mercator by the Krüger series (Karney 2011), accurate to
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
 * Where the atlas grid (height x width cells, rows from the top) sits on the map, and the cell under a point.
 *
 * The page pins each layer image to the map by its four corners. In between, the map stretches the image
 * linearly, while the grid is square in UTM rather than in latitude/longitude; this close to the equator and
 * the zone's central meridian that costs a few metres across the whole study area (tested), far under a 30 m cell.
 */
export function gridGeo(grid: Grid, height: number, width: number) {
  const { zone, south } = utmZone(grid.crs);
  const [x0, y0] = grid.origin;
  const latLonAt = (row: number, col: number) => fromUtm(x0 + col * grid.pixel, y0 - row * grid.pixel, zone, south);
  const [nwLat, nwLon] = latLonAt(0, 0);
  const [neLat, neLon] = latLonAt(0, width);
  const [swLat, swLon] = latLonAt(height, 0);
  const [seLat, seLon] = latLonAt(height, width);
  const bounds: [[number, number], [number, number]] = [
    [(swLat + seLat) / 2, (nwLon + swLon) / 2],
    [(nwLat + neLat) / 2, (neLon + seLon) / 2],
  ];
  return {
    /** [[south, west], [north, east]] in degrees */
    bounds,
    /** [lon, lat] of the top-left, top-right, bottom-right and bottom-left corners (MapLibre image sources) */
    corners: [[nwLon, nwLat], [neLon, neLat], [seLon, seLat], [swLon, swLat]] as [[number, number], [number, number], [number, number], [number, number]],
    /** [lat, lon] of a point given as fractional [row, col] (0, 0 = the top-left corner) */
    latLonAt,
    /** fractional [row, col] of a point; outside the grid when < 0 or >= height/width */
    cellAt(lat: number, lon: number): [number, number] {
      const [x, y] = toUtm(lat, lon, zone, south);
      return [(y0 - y) / grid.pixel, (x - x0) / grid.pixel];
    },
  };
}

/** "0.3136° N, 32.5811° E" */
export function formatLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
}
