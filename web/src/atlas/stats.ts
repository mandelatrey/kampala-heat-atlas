// Shape of docs/atlas/stats.json, written by scripts/14c_atlas_stats.py from outputs/tables/.
// Numbers are raw values; the page rounds them here, so one rerun of the analysis updates every sentence.
import { getJson, useLoad, type Load } from "../data";

type Range = [min: number, max: number];

export interface Numbers {
  built_km2: [number, number, number];
  sparse_to_dense_km2: number;
  /** fractions */
  label_agreement: Range;
  kappa: Range;
  validation_points: number;
  hot_km2: [number, number, number];
  /** Only when the persistence table has been made (on the author's machine). */
  hot_all_epochs_km2?: number;
  lst_r: Range;
  /** fraction of the area the standard Landsat surface-temperature product covers */
  c2st_coverage: Range;
  hottest_lcz: string[];
  fastest_warming_lcz: string;
  fastest_warming_lcz_change: number;
  dense_trees_anom: number;
  informal_anom: number;
  formal_dense_anom: number;
  became_informal_change: number;
  always_formal_change: number;
  sdi_anom: Range;
  sdi_dense_anom: Range;
  sdi_change: Range;
  sdi_dense_change: Range;
  /** fraction */
  sdi_detected_share: Range;
  cooling_per_10pct_canopy: number;
  planting_cooling: number;
  planting_new_canopy_km2: number;
  planting_people: number;
  cooling_model_r2: number;
  very_high_km2: number;
  very_high_people: number;
  /** percent */
  very_high_tree_pct: number;
  roofs: number;
  solar_gwp: number;
  solar_gwh: number;
  solar_yield: number;
  solar_top10_gwh: number;
  national_sales_gwh: number;
  noon_sun_min_deg: number;
  centre_lat: number;
  low_tilt_max_loss_pct: number;
  east_west_wall_ratio: number;
  /** Only with the wind table. */
  lake_breeze_peak_hour?: number;
  lake_breeze_peak_share?: number;
}

export interface Charts {
  landcover: { source: string; years: number[]; classes: { name: string; color: string; km2: number[] }[] };
  lcz: { source: string; years: [number, number]; series_colors: [string, string]; zones: { name: string; values: [number, number] }[] };
  trajectories: { source: string; years: number[]; series: { name: string; color: string; values: number[]; km2: number }[] };
  solar: {
    source: string;
    /** [largest roofs first, random roofs] */
    series_colors: [string, string];
    scenarios: { adoption: string; largest_first_gwh: number; random_gwh: number }[];
    benchmark: { label: string; gwh: number };
  };
  trees: { source: string; classes: { name: string; color: string; people: number; plantable_km2: number; km2: number }[] };
  /** Only when the wind table has been made (on the author's machine). */
  wind?: {
    source: string;
    source_note: string;
    day_color: string;
    night_color: string;
    /** direction each sector is centred on, degrees the wind comes FROM */
    sectors: number[];
    hours: { hour: number; speed: number; freq: number[] }[];
  };
}

export interface Stats {
  generated: string;
  years: [number, number, number];
  numbers: Numbers;
  charts: Charts;
  /** table file name -> path under docs/atlas/ */
  tables: Record<string, string>;
}

export function useStats(): Load<Stats> {
  return useLoad("atlas-stats", () => getJson<Stats>("atlas/stats.json"));
}

// ---- formatting

/** 1234.5 -> "1,235"; fixed decimals; a real minus sign. */
export function num(v: number, decimals = 0): string {
  const s = Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return Number(v.toFixed(decimals)) < 0 ? `−${s}` : s;
}

/** Always signed: "+1.0", "−2.2", "0.0". */
export function signed(v: number, decimals = 1): string {
  const r = Number(v.toFixed(decimals));
  return r > 0 ? `+${num(v, decimals)}` : num(v, decimals);
}

/** A range: "0.82–0.83"; a single value when both ends round the same. */
export function range([a, b]: Range, decimals = 0, f: (v: number, d: number) => string = num): string {
  const lo = f(a, decimals), hi = f(b, decimals);
  return lo === hi ? lo : `${lo}–${hi}`;
}

/** Fractions as a percent range: [0.208, 0.29] -> "21–29". */
export const pctRange = ([a, b]: Range, decimals = 0) => range([a * 100, b * 100], decimals);

/** 319277 -> "319,000" (to the nearest thousand), for people counts. */
export const thousands = (v: number) => num(Math.round(v / 1000) * 1000);

/** Percent change from a to b: "+38". */
export const pctChange = (a: number, b: number) => signed(100 * (b / a - 1), 0);

/** "05" -> "05:00" */
export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
