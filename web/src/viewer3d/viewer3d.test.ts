import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NO_DATA, rampColour } from "./colours";
import { clock, compass, sunPosition, timestamp } from "./sun";
import type { Districts } from "./types";

const KAMPALA = { lat: 0.3136, lon: 32.5811 };

describe("sun position", () => {
  it("puts the equinox noon sun almost overhead", () => {
    // solar noon in Kampala on 21 March is about 12:57 local
    const { elevation } = sunPosition(timestamp("21 Mar", 12 + 57 / 60), KAMPALA.lat, KAMPALA.lon);
    expect(elevation).toBeGreaterThan(88.5);
  });
  it("keeps the December noon sun above 66°, as the atlas says", () => {
    const peak = Math.max(...Array.from({ length: 41 }, (_, i) => sunPosition(timestamp("21 Dec", 11.5 + i * 0.05), KAMPALA.lat, KAMPALA.lon).elevation));
    expect(peak).toBeGreaterThan(66);
    expect(peak).toBeLessThan(66.5);
  });
  it("has the sun in the west in the afternoon and near the horizon at dawn", () => {
    const pm = sunPosition(timestamp("21 Mar", 16), KAMPALA.lat, KAMPALA.lon);
    expect(pm.azimuth).toBeGreaterThan(260);
    expect(pm.azimuth).toBeLessThan(280);
    expect(sunPosition(timestamp("21 Mar", 6.75), KAMPALA.lat, KAMPALA.lon).elevation).toBeLessThan(3);
  });
  it("is in the north in June and the south in December (morning, Kampala is just north of the equator)", () => {
    expect(compass(sunPosition(timestamp("21 Jun", 9), KAMPALA.lat, KAMPALA.lon).azimuth)).toBe("north-east");
    expect(compass(sunPosition(timestamp("21 Dec", 9), KAMPALA.lat, KAMPALA.lon).azimuth)).toBe("south-east");
  });
  it("formats time and bearings", () => {
    expect(clock(15.25)).toBe("15:15");
    expect(clock(6.5)).toBe("06:30");
    expect(compass(359)).toBe("north");
    expect(compass(225)).toBe("south-west");
  });
});

describe("building colours", () => {
  it("runs from the first to the last stop, clamped", () => {
    expect(rampColour("h", 3)).toEqual([0xcd, 0xe2, 0xfb]);
    expect(rampColour("h", 40)).toEqual([0x0d, 0x36, 0x6b]);
    expect(rampColour("h", 400)).toEqual([0x0d, 0x36, 0x6b]);
  });
  it("greys out missing values", () => {
    expect(rampColour("kwh", null)).toEqual(NO_DATA);
  });
});

// Contract test: the committed docs/data/ has what the viewer reads.
describe("docs/data/districts.json", () => {
  const dir = resolve(import.meta.dirname, "../../../docs");
  const districts = JSON.parse(readFileSync(resolve(dir, "data/districts.json"), "utf-8")) as Districts;
  it("lists districts whose data files exist, with the stats the page shows", () => {
    expect(Object.keys(districts).length).toBeGreaterThan(0);
    for (const [k, d] of Object.entries(districts)) {
      expect(existsSync(resolve(dir, d.file)), k).toBe(true);
      expect(d.centre, k).toHaveLength(2);
      expect(d.bounds, k).toHaveLength(4);
      for (const s of ["buildings", "mean_height_m", "ground_svf", "ground_shade_hours_10_16", "roof_shading_loss_pct", "wind_stagnant_share_pct"]) {
        expect(typeof d.stats[s], `${k}.${s}`).toBe("number");
      }
    }
  });
});
