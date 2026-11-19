import { useEffect, useState, type ReactNode } from "react";
import { dataUrl } from "../lib";
import type { Route } from "../router";
import { useMode, type Mode } from "../mode";
import { useTheme, type ThemeChoice } from "../theme";
import { Icon, Mark } from "./ui";

type Link = { label: string; href: string; active?: (r: Route) => boolean; external?: boolean; sub?: boolean };

const isAtlas = (section?: string) => (r: Route) => r.page === "atlas" && r.section === section;

// The atlas modules, in page order; the sidebar links to each.
// `plain` is the label in simple mode (see mode.ts)
export const MODULES: { id: string; label: string; plain: string }[] = [
  { id: "growth", label: "Urban growth", plain: "How the city grew" },
  { id: "heat", label: "Heat", plain: "Where it is hottest" },
  { id: "people", label: "Settlements", plain: "Crowded housing" },
  { id: "trees", label: "Where to plant", plain: "Where to plant trees" },
  { id: "cube", label: "The cube", plain: "Sun and breeze" },
  { id: "solar", label: "Rooftop solar", plain: "Rooftop solar" },
];

const groups = (mode: Mode): { title: string; links: Link[] }[] => [
  {
    title: "Atlas",
    links: [
      { label: "Overview", href: "#/atlas", active: isAtlas(undefined) },
      ...MODULES.map((m) => ({ label: mode === "simple" ? m.plain : m.label, href: `#/atlas/${m.id}`, active: isAtlas(m.id), sub: true })),
      { label: "Glossary", href: "#/atlas/glossary", active: isAtlas("glossary"), sub: true },
      { label: "3D model", href: "#/3d", active: (r) => r.page === "3d" },
    ],
  },
  {
    title: "Site weather",
    links: [
      { label: "Heat today", href: "#/heat", active: (r) => r.page === "heat" },
      { label: "All sites", href: "#/site-weather", active: (r) => r.page === "sites" || r.page === "site" },
      { label: "Map", href: dataUrl("site-weather/map.html"), external: true },
      { label: "Share today", href: dataUrl("site-weather/share.html"), external: true },
    ],
  },
  {
    title: "More",
    links: [
      { label: "Stories", href: dataUrl("stories.html"), external: true },
      { label: "Day vs night", href: dataUrl("daynight.html"), external: true },
      { label: "Meteogram", href: dataUrl("meteogram.html"), external: true },
      { label: "Figures", href: dataUrl("gallery.html"), external: true },
      { label: "Code", href: "https://github.com/gavacharles/kampala-heat-atlas", external: true },
    ],
  },
];

const THEMES: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <Icon.sun /> },
  { value: "auto", label: "Match system", icon: <Icon.auto /> },
  { value: "dark", label: "Dark", icon: <Icon.moon /> },
];

function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="theme" role="group" aria-label="Colour theme">
      {THEMES.map((t) => (
        <button key={t.value} type="button" aria-pressed={theme === t.value} title={t.label} aria-label={t.label} onClick={() => setTheme(t.value)}>
          {t.icon}
        </button>
      ))}
    </div>
  );
}

/** App frame: sidebar navigation (a drawer on narrow screens), theme switch, and the page. */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode] = useMode();
  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="shell" data-drawer={open ? "open" : "closed"}>
      <header className="topbar">
        <a className="brand" href="#/atlas"><Mark size={24} />Kampala Heat Atlas</a>
        <button type="button" className="iconbtn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon.menu /></button>
      </header>
      {open && <button type="button" className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <aside className="sidebar" aria-label="Site">
        <a className="brand" href="#/atlas"><Mark />Kampala Heat Atlas</a>
        <nav className="stack" aria-label="Pages" style={{ gap: 20 }}>
          {groups(mode).map((g) => (
            <div className="navgroup" key={g.title}>
              <span className="eyebrow">{g.title}</span>
              {g.links.map((l) => (
                <a
                  key={l.label}
                  className={`navlink${l.sub ? " sub" : ""}`}
                  href={l.href}
                  aria-current={l.active?.(route) ? "page" : undefined}
                  {...(l.external && l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  {l.label}
                  {l.external && <Icon.arrowOut className="ext" />}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <ThemeSwitch />
          <span className="byline">Research by Gava Charles</span>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
