import { describe, expect, it } from "vitest";
import { parseRoute } from "./router";

describe("parseRoute", () => {
  it("opens the atlas by default", () => {
    expect(parseRoute("")).toEqual({ page: "atlas" });
    expect(parseRoute("#/")).toEqual({ page: "atlas" });
    expect(parseRoute("#/atlas")).toEqual({ page: "atlas" });
  });
  it("keeps an atlas section, for links to the old page's #heat etc.", () => {
    expect(parseRoute("#/atlas/heat")).toEqual({ page: "atlas", section: "heat" });
  });
  it("routes the 3D viewer", () => {
    expect(parseRoute("#/3d")).toEqual({ page: "3d" });
    expect(parseRoute("#/3d/x").page).toBe("missing");
  });
  it("routes site weather", () => {
    expect(parseRoute("#/site-weather")).toEqual({ page: "sites" });
    expect(parseRoute("#/site-weather/central-kampala")).toEqual({ page: "site", slug: "central-kampala" });
  });
  it("rejects anything else", () => {
    expect(parseRoute("#/site-weather/a/b").page).toBe("missing");
    expect(parseRoute("#/site-weather/Bad Name").page).toBe("missing");
    expect(parseRoute("#/nope").page).toBe("missing");
  });
});
