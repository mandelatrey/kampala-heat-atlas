import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The app is built into docs/app/ and reads the data the Python scripts write elsewhere in docs/
// (for example ../site-weather/<slug>/site_briefing_latest.json). In development the app is served
// from /, so those URLs become /site-weather/...; this serves them from docs/ the same way.
const DOCS = resolve(__dirname, "../docs");
const TYPES: Record<string, string> = {
  ".json": "application/json", ".csv": "text/csv; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".png": "image/png", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".html": "text/html; charset=utf-8",
};

function serveDocs(): Plugin {
  return {
    name: "serve-docs",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
        if (!/^\/(site-weather|figures|data)\//.test(path)) return next();
        const file = normalize(join(DOCS, path));
        if (!file.startsWith(DOCS)) return next();
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), serveDocs()],
  build: { outDir: "../docs/app", emptyOutDir: true },
});
