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
