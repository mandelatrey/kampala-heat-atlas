import { describe, expect, it } from "vitest";
import { hourCells, parseCsv, slugify, splitHeadline, toMonthRows, tradeTitle, workingSpan } from "./lib";

describe("slugify", () => {
  it("matches the folder names the Python scripts create", () => {
    expect(slugify("Central Kampala")).toBe("central-kampala");
    expect(slugify("Dar es Salaam")).toBe("dar-es-salaam");
    expect(slugify("Kuwait City")).toBe("kuwait-city");
  });
});

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

describe("hourCells", () => {
  it("flags the lunch gap", () => {
    const cells = hourCells([[11, 0], [12, 1], [14, 2], [15, 2]]);
    expect(cells.map((c) => c.gapBefore)).toEqual([false, false, true, false]);
  });
});

describe("tradeTitle", () => {
  it("follows the Python page's wording", () => {
    expect(tradeTitle({ key: "concrete", status: "STOP", windows: "" })).toBe("No window today");
    expect(tradeTitle({ key: "labour", status: "LIMITED", windows: "08-10 h" })).toBe("Work/rest cycles");
    expect(tradeTitle({ key: "crane", status: "LIMITED", windows: "08-12 h" })).toBe("Go 08-12 h");
    expect(tradeTitle({ key: "crane", status: "CAUTION", windows: "" })).toBe("Go with care");
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

describe("workingSpan", () => {
  it("keeps the hours only", () => {
    expect(workingSpan("08:00-17:00, lunch excluded (8 h)")).toBe("08:00-17:00");
  });
});
