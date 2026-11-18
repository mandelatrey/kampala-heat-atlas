import { useEffect } from "react";
import { useSites } from "../data";
import { slugify } from "../lib";
import { siteHref } from "../router";
import type { Site } from "../types";

export function SiteList() {
  const list = useSites();
  useEffect(() => {
    document.title = "Site Weather";
  }, []);

  return (
    <>
      <h1>Site weather</h1>
      <p className="lede">
        For contractors and site managers: hour-by-hour workable time for seven trades, a daily site note and a
        month-by-month weather record against each town's 1991-2020 climate. Refreshed every morning. Pick the town
        nearest your site.
      </p>
      {list.state === "loading" && <p className="lede">Loading sites…</p>}
      {list.state === "error" && <p className="lede">The site list could not be loaded ({list.message}).</p>}
      {list.state === "ready" &&
        Object.entries(list.data.groups).map(([group, label]) => {
          const sites = list.data.sites.filter((s) => s.group === group);
          if (sites.length === 0) return null;
          const byArea = new Map<string, Site[]>();
          for (const s of sites) {
            const area = s.region ?? s.country;
            byArea.set(area, [...(byArea.get(area) ?? []), s]);
          }
          return (
            <section key={group}>
              <h2>{label}</h2>
              {[...byArea].map(([area, inArea]) => (
                <div key={area} className="area">
                  <p className="eyebrow">{area}</p>
                  <div className="sites">
                    {inArea.map((s) => (
                      <a key={s.name} className="site" href={siteHref(slugify(s.name))}>{s.name}</a>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
    </>
  );
}
