// Heat today: the public heat advisory for one town, with what to do and ways to pass it on.
import { useEffect, useState } from "react";
import { Term } from "../components/Term";
import { Icon } from "../components/ui";
import { slugOf, useSite, useSiteList } from "../data";
import { dataUrl } from "../lib";
import { siteHref } from "../router";
import type { HeatAdvisory } from "../types";
import { cardImage, hoursText, LEVEL_COLOURS, shareText, SIGNS } from "./share";
import "./heat.css";

export const DEFAULT_TOWN = "central-kampala";
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const LEVEL_WORD = ["Low", "Moderate", "High", "Very high", "Extreme"];

function TownPicker({ slug }: { slug: string }) {
  const list = useSiteList();
  if (list.state !== "ready") return null;
  const groups = Object.entries(list.data.groups);
  return (
    <label className="town-pick">
      <span className="eyebrow">Town</span>
      <select value={slug} onChange={(e) => { window.location.hash = `#/heat/${e.target.value}`; }}>
        {groups.map(([key, name]) => (
          <optgroup key={key} label={name}>
            {list.data.sites.filter((s) => s.group === key).map((s) => (
              <option key={s.name} value={slugOf(s.name)}>{s.name}{s.country && key !== "uganda" ? `, ${s.country}` : ""}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function Hours({ h }: { h: HeatAdvisory }) {
  return (
    <div className="heat-hours" role="list" aria-label="Heat level, hour by hour">
      {h.hours.map(([hour, lv]) => (
        <span key={hour} role="listitem" className={`hh lv-${lv}`} title={`${hh(hour)}: ${LEVEL_WORD[lv]}`}>
          <i />
          <small>{hour % 2 === 0 ? String(hour).padStart(2, "0") : ""}</small>
          <span className="sr-only">{hh(hour)} {LEVEL_WORD[lv]}</span>
        </span>
      ))}
    </div>
  );
}

const WHO_ICON = { workers: <Icon.hardhat size={18} />, vendors: <Icon.map size={18} />, children: <Icon.sun size={18} />, elderly: <Icon.heat size={18} /> };

function Share({ h, place, day, today }: { h: HeatAdvisory; place: string; day: string; today: boolean }) {
  const url = window.location.href;
  const text = shareText(h, place, day, url, today);
  const [note, setNote] = useState<string | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied: paste it into WhatsApp or an SMS.");
    } catch {
      setNote("Could not copy: select the text above and copy it.");
    }
  };
  const image = () => cardImage(h, place, day, url.replace(/^https?:\/\//, "").split("#")[0] ?? "", today);
  const download = async () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await image());
    a.download = `heat-${slugOf(place)}-${day.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const share = async () => {
    try {
      const file = new File([await image()], "heat-today.png", { type: "image/png" });
      const withFile = navigator.canShare?.({ files: [file] });
      await navigator.share(withFile ? { text, files: [file] } : { title: `Heat ${today ? "today" : "forecast"} · ${place}`, text });
    } catch {
      /* closed by the user, or not allowed: nothing to do */
    }
  };
  return (
    <section className="card card-pad heat-share" aria-label="Pass it on">
      <div className="card-head">
        <h2>Pass it on</h2>
        <span className="muted" style={{ fontSize: 13 }}>For family, workmates, a school or a market group</span>
      </div>
      <pre className="share-text">{text}</pre>
      <div className="chips">
        <a className="btn primary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
        {"share" in navigator && <button type="button" className="btn" onClick={share}>Share…</button>}
        <button type="button" className="btn" onClick={copy}>Copy text</button>
        <button type="button" className="btn" onClick={download}>Download image</button>
      </div>
      {note && <p className="fine" role="status">{note}</p>}
    </section>
  );
}

export function HeatPage({ slug = DEFAULT_TOWN }: { slug?: string }) {
  const site = useSite(slug);
  const [sel, setSel] = useState(0);
  const place = site.state === "ready" ? site.data.briefing.site : "";
  useEffect(() => {
    document.title = place ? `Heat today · ${place}` : "Heat today";
  }, [place]);
  useEffect(() => setSel(0), [slug]);

  if (site.state === "loading") return <p className="state">Loading the forecast…</p>;
  if (site.state === "error") {
    return (
      <div className="page heat">
        <h1>No forecast for “{slug}”</h1>
        <p className="lede">The forecast could not be loaded ({site.message}).</p>
        <p><a className="btn" href={`#/heat/${DEFAULT_TOWN}`}>Heat today in Kampala</a></p>
      </div>
    );
  }
  const { briefing } = site.data;
  const days = briefing.days;
  const day = days[sel] ?? days[0];
  const h = day?.heat;
  const when = sel === 0 ? "today" : `on ${day?.day ?? ""}`;
  return (
    <div className="page heat">
      <div className="heat-top">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Heat {sel === 0 ? "today" : "forecast"}</span>
          <h1>{briefing.site}</h1>
        </div>
        <TownPicker slug={slug} />
      </div>

      {!day || !h ? (
        <section className="card card-pad">
          <h2>No heat advisory yet for {briefing.site}</h2>
          <p className="lede" style={{ fontSize: 15 }}>
            The heat advisory is added to each town's forecast on the morning run, so it appears here after the next one.
            Meanwhile the <a href={siteHref(slug)}>everyday weather page</a> shows heat hour by hour.
          </p>
        </section>
      ) : (
        <>
          <div className="heat-days" role="group" aria-label="Choose a day">
            {days.map((d, i) => d.heat && (
              <button key={d.date} type="button" aria-pressed={i === sel} onClick={() => setSel(i)}
                aria-label={`${d.day}: ${d.heat.name} heat`}>
                <span className={`dot lv-${d.heat.level}`} />
                <b>{i === 0 ? "Today" : d.day.split(" ")[0]?.slice(0, 3)}</b>
                <small>{d.heat.name}</small>
              </button>
            ))}
          </div>

          <section className={`heat-hero lv-${h.level}`} aria-label={`Heat ${when}`} style={{ background: LEVEL_COLOURS[h.level]![0], color: LEVEL_COLOURS[h.level]![1] }}>
            <span className="eyebrow">{day.day} · heat level</span>
            <p className="heat-level">{h.name}</p>
            {h.level > 0 && <p className="heat-when">{hoursText(h.window)}{h.peak_hour !== null && ` · hottest around ${hh(h.peak_hour)}`}</p>}
            <p className="heat-head">{h.headline}</p>
            {h.peak_wbgt !== null && (
              <p className="heat-sub"><Term id="wbgt">Heat stress</Term> up to {Math.round(h.peak_wbgt)} °C in the sun. Shade brings it down by a few degrees.</p>
            )}
          </section>

          <section className="card card-pad" aria-label="Hour by hour">
            <div className="card-head">
              <h2>Hour by hour</h2>
              <div className="legend-row heat-legend" aria-label="Key">
                {LEVEL_WORD.map((w, i) => <span key={w}><i className={`lv-${i}`} />{w}</span>)}
              </div>
            </div>
            <Hours h={h} />
          </section>

          <section className="heat-advice" aria-label="What to do">
            {h.advice.map((a) => (
              <article key={a.key} className="card card-pad advice">
                <span className="advice-icon">{WHO_ICON[a.key]}</span>
                <h3>{a.who}</h3>
                <p>{a.text}{h.level > 0 && h.window && !a.text.includes(":00") && <span className="muted"> ({hoursText(h.window)})</span>}</p>
              </article>
            ))}
          </section>

          <section className="card card-pad signs" aria-label="Signs of heat illness">
            <Icon.alert size={20} />
            <p>{SIGNS}</p>
          </section>

          <Share h={h} place={briefing.site} day={day.day} today={sel === 0} />
        </>
      )}

      <p className="fine">
        Advice from a weather forecast, not an official warning: follow warnings from the national weather service (in Uganda, UNMA)
        and the health ministry. Levels from forecast heat stress (WBGT) in the sun; <a href={dataUrl("site-weather/thresholds.json")}>limits used</a>.
        More for this town: <a href={siteHref(slug)}>everyday weather, hour by hour</a>. Forecast data: Open-Meteo (CC BY 4.0).
      </p>
    </div>
  );
}
