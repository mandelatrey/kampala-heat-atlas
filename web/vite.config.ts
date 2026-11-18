import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The app is built into docs/app/ and reads the data the Python scripts write elsewhere in docs/
// (../atlas/atlas.json, ../site-weather/<slug>/..., links to ../3d.html). In development the app is
// served from /, so those URLs become /atlas/..., /site-weather/...; this serves them from docs/.
// Any file under docs/ is served, so a newly moved page needs no change here, except docs/index.html
// (it forwards to the built app) and docs/app/ (the built copy of this app).
const DOCS = resolve(import.meta.dirname, "../docs");
const TYPES: Record<string, string> = {
  ".json": "application/json", ".csv": "text/csv; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".mp4": "video/mp4", ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
};

/** The docs/ file a dev-server request should get, or null to let Vite handle it. */
export function docsFile(url: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(url.split("?")[0] ?? "/");
  } catch {
    return null;
  }
  if (path === "/" || path === "/index.html" || path.startsWith("/app/")) return null;
  const file = normalize(join(DOCS, path));
  if (!file.startsWith(DOCS + sep)) return null;
  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

function serveDocs(): Plugin {
  return {
    name: "serve-docs",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = docsFile(req.url ?? "/");
        if (!file) return next();
        res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), serveDocs()],
  // the 3D viewer chunk (deck.gl, ~200 kB gzipped) is loaded only on its own page
  build: { outDir: "../docs/app", emptyOutDir: true, chunkSizeWarningLimit: 800 },
});
