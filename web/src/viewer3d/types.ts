// Shapes of the 3D viewer's data, written by scripts/17_build_site.py into docs/data/.

/** One district in docs/data/districts.json. */
export interface DistrictMeta {
  label: string;
  /** Path relative to docs/, e.g. "data/district_cbd.json". */
  file: string;
  /** [lon, lat] */
  centre: [number, number];
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  /** Ground rectangle, [lon, lat] corners. */
  ground: [number, number][];
  stats: {
    buildings: number;
    mean_height_m: number;
    ground_svf: number;
    ground_shade_hours_10_16: number;
    roof_shading_loss_pct: number;
    wind_stagnant_share_pct: number;
    [other: string]: number;
  };
}

export type Districts = Record<string, DistrictMeta>;

export interface Building {
  /** Footprint ring, [lon, lat]. */
  p: [number, number][];
  /** Height, m. */
  h: number;
  /** Roof sunlight, kWh/m²/yr (null where not computed). */
  kwh: number | null;
  /** Roof shading loss, %. */
  loss: number | null;
  /** Wall sun penalty vs an east-west layout, kWh/m²/yr. */
  pen: number;
}

/** Flow arrow: [lon, lat, lon2, lat2, speed ratio]. */
export type Arrow = [number, number, number, number, number];

/** docs/data/district_<name>.json */
export interface DistrictData {
  buildings: Building[];
  arrows: Arrow[];
  /** Ground shade hours (10:00-16:00) as a PNG data URI. */
  shade_png: string;
}
