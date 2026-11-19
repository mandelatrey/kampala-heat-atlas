// Shapes of the files written by scripts/29_site_weather.py and scripts/31_site_weather_all.py.
// If the Python output changes, change these types and the compiler will point at every use.

export type Status = "GO" | "CAUTION" | "LIMITED" | "STOP";

/** Trade status per working hour: 0 go, 1 caution, 2 stop. */
export type HourStatus = 0 | 1 | 2;

export type TradeKey = "concrete" | "asphalt" | "crane" | "height" | "coatings" | "earthworks" | "labour";

export interface TradeRow {
  key: TradeKey;
  trade: string;
  status: Status;
  label: string;
  go_hours: number;
  /** Go windows, e.g. "08-10 h", or "" when there are none. */
  windows: string;
  causes: string[];
  action: string;
  /** [hour of day, status] for each working hour. */
  hours: [number, HourStatus][];
}

/** One everyday activity for the day (scripts/everyday.py): the same go / with care / stop strip as a trade. */
export interface EverydayRow {
  key: string;
  name: string;
  /** e.g. "Getting around"; one of Everyday.groups */
  group: string;
  status: Status;
  /** e.g. "Best 06-12 h", "With care, not 14-17 h", "Fine all day" */
  label: string;
  go_hours: number;
  windows: string;
  causes: string[];
  /** What to do, in plain words. */
  action: string;
  /** [hour of day, status] for each hour from Everyday.hours. */
  hours: [number, HourStatus][];
}

/** Everyday advice for the public for one day. */
export interface Everyday {
  headline: string;
  /** e.g. "06:00-21:00" */
  hours: string;
  groups: string[];
  rows: EverydayRow[];
  extras: string[];
}

export interface DayFacts {
  rain_mm: number;
  rain_chance: number;
  storm: "likely" | "possible" | "low";
  /** Hour the storm risk starts ("12"), or "". */
  storm_from: string;
  wbgt_peak: number;
  gust_hook_max: number;
  go_hours: Record<TradeKey, number>;
}

export interface DayBriefing {
  date: string;
  day: string;
  headline: string;
  rows: TradeRow[];
  extras: string[];
  facts: DayFacts;
  /** Briefings written before the everyday advice was added have none. */
  everyday?: Everyday;
}

/** <site>/site_briefing_latest.json */
export interface Briefing {
  site: string;
  lat: number;
  lon: number;
  /** "YYYY-MM-DD HH:MM", local time at the site. */
  issued: string;
  /** e.g. "08:00-17:00, lunch excluded (8 h)" */
  working: string;
  days: DayBriefing[];
}

/** One row of <site>/archive/monthly_index.csv */
export interface MonthRow {
  month: string;
  days_recorded: number;
  rain_mm: number;
  rain_pct_of_normal_pro_rata: number | null;
  heavy_rain_days: number;
  exceptional_rain_days: number;
  lost_hours_concrete: number;
  lost_hours_labour: number;
}

/** One entry of site-weather/sites.json */
export interface Site {
  name: string;
  region?: string;
  country: string;
  group: string;
  lat: number;
  lon: number;
}

/** The limits the gauges mark, from <site>/thresholds_site.json (only the fields the page reads). */
export interface SiteThresholds {
  heat_wbgt_moderate_work_acclimatised_C: { continuous: number; work25_rest75: number };
  crane: { gust_caution_ms: number; gust_stop_ms: number; hook_height_m: number };
  concrete: { rain_prob_caution_pct: number; rain_prob_stop_pct: number };
  earthworks: { rain_prev24h_caution_mm: number; rain_prev24h_stop_mm: number };
}

/** One town in site-weather/towns_today.json (written by scripts/31_site_weather_all.py). */
export interface TownToday {
  name: string;
  region: string;
  country: string;
  group: string;
  slug: string;
  issued: string;
  day: string;
  headline: string;
  /** Worst status across the trades today. */
  worst: Status;
  facts: DayFacts;
  rows: { trade: string; status: Status; label: string }[];
}

export interface TownsToday {
  issued: string;
  towns: TownToday[];
  activities: { key: TradeKey; name: string }[];
}
