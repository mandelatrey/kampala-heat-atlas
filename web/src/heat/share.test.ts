import { describe, expect, it } from "vitest";
import type { HeatAdvisory } from "../types";
import { firstSentence, hoursText, shareText, wrap } from "./share";

const high: HeatAdvisory = {
  level: 2, name: "High", headline: "", peak_wbgt: 29.4, peak_hour: 13, window: "12-15 h", risk_hours: "10-17 h",
  hours: [[12, 2], [13, 2]],
  advice: [
    { key: "workers", who: "Outdoor workers and boda riders", text: "Take a 15-minute shade break every hour during these hours, and drink water." },
    { key: "children", who: "Schools and children", text: "No sports in the sun during these hours; water for every child." },
  ],
};

describe("heat advisory to share", () => {
  it("reads hour windows", () => {
    expect(hoursText("12-15 h")).toBe("12:00 to 15:00");
    expect(hoursText("11-12 h, 14-17 h")).toBe("11:00 to 17:00");
    expect(hoursText("")).toBe("");
  });

  it("writes a WhatsApp message with the level, the hours, advice by group and the link", () => {
    const t = shareText(high, "Central Kampala", "Thursday 19 November", "https://example.org/#/heat");
    const lines = t.split("\n");
    expect(lines[0]).toBe("🌡️ Heat today in Central Kampala (Thursday 19 November)");
    expect(lines[1]).toBe("HIGH heat 12:00 to 15:00 (heat stress up to 29 °C WBGT).");
    expect(t).toContain("👷 Outdoor workers and boda riders: Take a 15-minute shade break");
    expect(t).toContain("🏫 Schools and children:");
    expect(t).toMatch(/Signs of heat illness/);
    expect(lines.at(-1)).toBe("Advice from a weather forecast, not an official warning. More: https://example.org/#/heat");
  });

  it("keeps a low day short", () => {
    const t = shareText({ ...high, level: 0, name: "Low", window: "" }, "Jinja", "Friday 20 November", "u", false);
    expect(t.split("\n")).toEqual([
      "🌡️ Heat forecast for Jinja, Friday 20 November",
      "Low heat stress: a normal day. Drink water and use shade at midday.", "",
      "Advice from a weather forecast, not an official warning. More: u",
    ]);
  });

  it("shortens and wraps advice for the image card", () => {
    expect(firstSentence("No sports in the sun during these hours; water for every child.")).toBe("No sports in the sun during these hours.");
    expect(firstSentence("Drink water. Rest.")).toBe("Drink water.");
    expect(wrap((s) => s.length * 10, "one two three four", 100)).toEqual(["one two", "three four"]);
  });
});
