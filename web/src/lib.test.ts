import { describe, expect, it } from "vitest";
import { parseCsv, splitHeadline, toMonthRows } from "./lib";

describe("splitHeadline", () => {
  it("marks the first time window", () => {
    expect(splitHeadline("Pour concrete 08-10 h; rain limits the rest of the day.")).toEqual([
      "Pour concrete ", "08-10 h", "; rain limits the rest of the day.",
    ]);
  });
  it("marks a storm start time", () => {
    expect(splitHeadline("Storms possible from 12:00: do exposed work in the morning.")[1]).toBe("from 12:00");
  });
  it("leaves a headline without a time alone", () => {
    expect(splitHeadline("Good working day: no weather limits on any trade.")).toEqual([
      "Good working day: no weather limits on any trade.", "", "",
    ]);
  });
});

describe("monthly index", () => {
  it("reads the CSV, keeping a missing percentage as null", () => {
    const csv = "month,days_recorded,rain_mm,rain_pct_of_normal_pro_rata,heavy_rain_days\n2026-01,31,60.3,56.0,0\n2026-02,3,1.0,,0\n";
    const rows = toMonthRows(parseCsv(csv));
    expect(rows[0]).toMatchObject({ month: "2026-01", days_recorded: 31, rain_mm: 60.3, rain_pct_of_normal_pro_rata: 56 });
    expect(rows[1]?.rain_pct_of_normal_pro_rata).toBeNull();
  });
});
