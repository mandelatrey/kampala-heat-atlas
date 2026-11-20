import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { styleEditor } from "./src/devtools/server";

// The app is built into docs/app/ and reads the data the Python scripts write elsewhere in docs/
// (../atlas/atlas.json, ../site-weather/<slug>/..., links to ../3d.html). In development the app is
// served from /, so those URLs become /atlas/..., /site-weather/...; this serves them from docs/.
// Any file under docs/ is served, so a newly moved page needs no change here, except docs/index.html
// (it forwards to the built app) and docs/app/ (the built copy of this app).
// KHA_DOCS=/some/other/docs npm run dev previews a pipeline run written somewhere else, before committing it.
const DOCS = resolve(process.env.KHA_DOCS ?? resolve(import.meta.dirname, "../docs"));
const TYPES: Record<string, string> = {
  ".json": "application/json", ".csv": "text/csv; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".mp4": "video/mp4", ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8", ".tif": "image/tiff", ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
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
  // styleEditor: the dev-only style editor writes CSS edits made in the browser back into src/ (see src/devtools/)
  plugins: [react(), serveDocs(), styleEditor(resolve(import.meta.dirname, "src"))],
  // big chunks load only where they are used: the 3D viewer (deck.gl, ~220 kB gzipped) on its own page,
  // MapLibre (~300 kB gzipped) when the atlas map is shown
  build: { outDir: "../docs/app", emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
