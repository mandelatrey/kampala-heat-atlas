import { describe, expect, it } from "vitest";
import { docsFile } from "../vite.config";

describe("dev server: files served from docs/", () => {
  it("serves any data file the app reads", () => {
    expect(docsFile("/atlas/atlas.json")).toMatch(/docs\/atlas\/atlas\.json$/);
    expect(docsFile("/atlas/base.jpg?v=1")).toMatch(/docs\/atlas\/base\.jpg$/);
    expect(docsFile("/site-weather/sites.json")).toMatch(/docs\/site-weather\/sites\.json$/);
    expect(docsFile("/3d.html")).toMatch(/docs\/3d\.html$/);
  });
  it("leaves the app's own pages and code to Vite", () => {
    expect(docsFile("/")).toBeNull();
    expect(docsFile("/index.html")).toBeNull();
    expect(docsFile("/app/index.html")).toBeNull();
    expect(docsFile("/src/main.tsx")).toBeNull();
  });
  it("never serves files outside docs/", () => {
    expect(docsFile("/../README.md")).toBeNull();
    expect(docsFile("/%2e%2e/README.md")).toBeNull();
    expect(docsFile("/%E0%A4%A")).toBeNull();
  });
});
