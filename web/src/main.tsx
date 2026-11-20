import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Development only: the style editor (Shift+Alt+E). import.meta.env.DEV is false in `npm run build`, so it is never shipped.
if (import.meta.env.DEV) void import("./devtools/StyleEditor").then((m) => m.mountStyleEditor());
