import { useEffect, useMemo, useState } from "react";
import { Icon, StatusPill } from "../components/ui";
import { useTowns } from "../data";
import { dataUrl } from "../lib";
import { siteHref } from "../router";
import type { Status, TownToday } from "../types";
import { STATUS_WORD, statusTone } from "./logic";
import "./sites.css";

const RANK: Record<Status, number> = { STOP: 0, LIMITED: 1, CAUTION: 2, GO: 3 };

/** Status of one town for the chosen trade ("" = worst of all trades), with its label. */
function statusFor(t: TownToday, trade: string): { status: Status; label: string } {
  if (!trade) return { status: t.worst, label: STATUS_WORD[t.worst] };
  const r = t.rows.find((x) => trade === x.trade || trade.startsWith(`${x.trade} (`));
  if (!r) return { status: t.worst, label: STATUS_WORD[t.worst] };
  return { status: r.status, label: r.status === "GO" ? "Go" : r.label.replace(/^go /, "Go ").replace(/^STOP/, "Stop") };
}

export function SiteList() {
  const data = useTowns();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [trade, setTrade] = useState("");
  const [sort, setSort] = useState<"name" | "status">("name");
  useEffect(() => {
    document.title = "Site weather · Kampala Heat Atlas";
  }, []);

  const towns = useMemo(() => {
    if (data.state !== "ready") return [];
    const q = query.trim().toLowerCase();
    const list = data.data.towns.filter((t) => (!group || t.group === group) && (!q || `${t.name} ${t.region} ${t.country}`.toLowerCase().includes(q)));
    return [...list].sort((a, b) =>
      sort === "status" ? RANK[statusFor(a, trade).status] - RANK[statusFor(b, trade).status] || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  }, [data, query, group, trade, sort]);

  if (data.state === "loading") return <p className="state">Loading today's site weather…</p>;
  if (data.state === "error") return <p className="state">Today's site weather could not be loaded ({data.message}).</p>;
  const { towns: all, groups, activities, issued } = data.data;
  const stormsLikely = all.filter((t) => t.facts.storm === "likely").length;
  const heatStops = all.filter((t) => t.rows.some((r) => r.trade.startsWith("Outdoor labour") && r.status !== "GO")).length;
  const concreteOk = all.filter((t) => t.rows.some((r) => r.trade === "Concrete pour" && r.status !== "STOP")).length;

  return (
    <div className="page">
      <header className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Site weather · issued {issued}</span>
        <h1>Today on site</h1>
        <p className="lede">
          Hour-by-hour workable time for seven trades, a daily site note and a monthly weather record against each town's
          1991-2020 climate. Pick the town nearest your site.
        </p>
      </header>

      <section className="card kpis" aria-label="Today across all sites">
        <div className="kpi"><span className="eyebrow">Sites</span><b>{all.length}</b><span>across Africa and the Gulf</span></div>
        <div className="kpi"><span className="eyebrow">Storms likely</span><b>{stormsLikely}</b><span>sites today</span></div>
        <div className="kpi"><span className="eyebrow">Heat limits</span><b>{heatStops}</b><span>sites need work/rest for outdoor labour</span></div>
        <div className="kpi"><span className="eyebrow">Concrete</span><b>{concreteOk}</b><span>sites have a pour window</span></div>
      </section>

      <section className="card" aria-label="Sites">
        <div className="filters">
          <div className="filter-row">
            <label className="search">
              <Icon.search />
              <span className="sr-only">Search towns</span>
              <input type="search" placeholder="Search a town or country" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label className="sr-only" htmlFor="trade">Show status for</label>
            <select id="trade" className="select" value={trade} onChange={(e) => setTrade(e.target.value)}>
              <option value="">All trades (worst)</option>
              {activities.map((a) => <option key={a.key} value={a.name}>{a.name}</option>)}
            </select>
            <label className="sr-only" htmlFor="sort">Sort by</label>
            <select id="sort" className="select" value={sort} onChange={(e) => setSort(e.target.value as "name" | "status")}>
              <option value="name">A to Z</option>
              <option value="status">Most limited first</option>
            </select>
          </div>
          <div className="chips" role="group" aria-label="Region">
            <button type="button" className="chip" aria-pressed={!group} onClick={() => setGroup("")}>All regions</button>
            {Object.entries(groups).map(([k, label]) => (
              <button key={k} type="button" className="chip" aria-pressed={group === k} onClick={() => setGroup(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="scroll-x" style={{ padding: "0 8px 8px" }}>
          <table className="data towns">
            <thead>
              <tr><th>Town</th><th>Today</th><th>{trade || "All trades"}</th><th>Storms</th><th className="r">WBGT</th></tr>
            </thead>
            <tbody>
              {towns.length === 0 && <tr><td colSpan={5} className="muted">No town matches “{query}”.</td></tr>}
              {towns.map((t) => {
                const s = statusFor(t, trade);
                const href = siteHref(t.slug);
                return (
                  <tr key={t.slug} onClick={() => { window.location.hash = href; }}>
                    <td className="town"><a href={href}>{t.name}</a><small>{t.region === t.name ? t.country : `${t.region} · ${t.country}`}</small></td>
                    <td className="headline">{t.headline}</td>
                    <td><StatusPill tone={statusTone(s.status)}>{s.label}</StatusPill></td>
                    <td className="storm">
                      <span className="storm-cell">
                        {t.facts.storm !== "low" && <span className={`storm-${t.facts.storm}`}><Icon.storm size={15} /></span>}
                        {t.facts.storm === "low" ? "Low" : `${t.facts.storm[0]?.toUpperCase()}${t.facts.storm.slice(1)}${t.facts.storm_from ? ` from ${t.facts.storm_from}:00` : ""}`}
                      </span>
                    </td>
                    <td className="r num wbgt">{t.facts.wbgt_peak.toFixed(0)} °C</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="chips">
        <a className="btn" href={dataUrl("site-weather/map.html")}><Icon.map /> Open the map</a>
        <a className="btn" href={dataUrl("site-weather/share.html")}>Share today's cards</a>
      </p>
      <p className="fine">
        Screening guidance from a weather forecast, not an instruction. The contract specification, crane manufacturer's limits and
        site health-and-safety plan take precedence. Data: Open-Meteo (CC BY 4.0).
      </p>
    </div>
  );
}
