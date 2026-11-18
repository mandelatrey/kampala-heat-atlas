// Sun position for the readout next to the time slider (NOAA solar calculator equations).
// deck.gl's SunLight does its own calculation for the lighting; this is only for the words.

const rad = Math.PI / 180;

/** Kampala keeps East Africa Time all year: UTC+3. */
export const UTC_OFFSET_H = 3;

export const DAYS = { "21 Mar": "03-21", "21 Jun": "06-21", "21 Dec": "12-21" } as const;
export type DayKey = keyof typeof DAYS;

/** Milliseconds since the epoch for a local hour (e.g. 15.25) on one of the three days, in 2025. */
export function timestamp(day: DayKey, hour: number): number {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return Date.UTC(2025, Number(DAYS[day].slice(0, 2)) - 1, Number(DAYS[day].slice(3)), h - UTC_OFFSET_H, m);
}

/** Solar elevation (degrees above the horizon) and azimuth (degrees clockwise from north). */
export function sunPosition(ms: number, lat: number, lon: number): { elevation: number; azimuth: number } {
  const jd = ms / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c = Math.sin(m * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * m * rad) * (0.019993 - 0.000101 * t) + Math.sin(3 * m * rad) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad)) / rad;
  const y = Math.tan((eps / 2) * rad) ** 2;
  const eqTime = 4 / rad * (y * Math.sin(2 * l0 * rad) - 2 * e * Math.sin(m * rad) + 4 * e * y * Math.sin(m * rad) * Math.cos(2 * l0 * rad)
    - 0.5 * y * y * Math.sin(4 * l0 * rad) - 1.25 * e * e * Math.sin(2 * m * rad));
  const minutesUtc = ((ms % 86400000) + 86400000) % 86400000 / 60000;
  const trueSolarTime = (((minutesUtc + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  const hourAngle = trueSolarTime / 4 < 0 ? trueSolarTime / 4 + 180 : trueSolarTime / 4 - 180;
  const zenith = Math.acos(Math.sin(lat * rad) * Math.sin(decl * rad) + Math.cos(lat * rad) * Math.cos(decl * rad) * Math.cos(hourAngle * rad)) / rad;
  const azDen = Math.cos(lat * rad) * Math.sin(zenith * rad);
  let azimuth: number;
  if (Math.abs(azDen) < 1e-9) {
    azimuth = lat > 0 ? 180 : 0;
  } else {
    const cosAz = ((Math.sin(lat * rad) * Math.cos(zenith * rad)) - Math.sin(decl * rad)) / azDen;
    const a = Math.acos(Math.max(-1, Math.min(1, cosAz))) / rad;
    azimuth = hourAngle > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }
  return { elevation: 90 - zenith, azimuth };
}

const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** "north-east" etc. for a bearing in degrees. */
export function compass(deg: number): string {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8] ?? "north";
}

/** "15:15" for 15.25 */
export function clock(hour: number): string {
  const h = Math.floor(hour);
  return `${String(h).padStart(2, "0")}:${String(Math.round((hour - h) * 60)).padStart(2, "0")}`;
}
