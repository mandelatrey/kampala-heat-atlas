import { useEffect, useState } from "react";
import { Icon } from "../components/ui";
import { useSite } from "../data";
import { dataUrl, splitHeadline } from "../lib";
import type { MonthRow } from "../types";
import { ActivityTable } from "./everyday";
import { sky, stormAlert, type View } from "./logic";
import { Gauges, TradeTable, WeekStrip, WorkdayArc } from "./parts";
import "./sites.css";

/** "08:00-17:00, lunch excluded (8 h)" -> [8, 17] */
function workingHours(working: string): [number, number] {
  const m = /(\d{1,2}):\d{2}\s*-\s*(\d{1,2}):\d{2}/.exec(working);
  return m ? [Number(m[1]), Number(m[2])] : [8, 17];
}

const VIEW_KEY = "kha-site-view";

/** Everyday (the public) or construction; remembered per browser, a convenience only. */
function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "construction" ? "construction" : "everyday";
    } catch {
      return "everyday";
    }
  });
  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode: the choice lasts for this visit only */
    }
  };
  return [view, choose];
}

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: [View, string][] = [["everyday", "Everyday"], ["construction", "Construction"]];
  return (
    <div className="view-switch" role="group" aria-label="Advice for">
      {opts.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

/** Hide an image the pipeline has not produced (images are deployed by CI, not committed). */
const hideIfMissing = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.closest("figure")?.setAttribute("hidden", "");
};

function MonthlyRecord({ base, months }: { base: string; months: MonthRow[] }) {
  return (
    <section className="card card-pad stack" aria-label="Monthly record">
      <div className="stack" style={{ gap: 4 }}>
        <h2>Monthly record</h2>
        <p className="lede" style={{ fontSize: 14 }}>
          Rain against the 1991-2020 normal, heavy and exceptional days, and working hours lost. Days start as preliminary
          model analysis and are replaced by ERA5 about a week later. Useful as supporting evidence for extension-of-time
          claims (FIDIC 2017 Sub-Clause 8.5); a site rain gauge and the daily diary remain the primary record.
        </p>
      </div>
      <div className="scroll-x">
        <table className="data record">
          <thead>
            <tr>
              <th>Month</th><th className="r">Days</th><th className="r">Rain mm</th><th>Of normal</th><th className="r">Heavy</th>
              <th className="r">Exceptional</th><th className="r">Concrete h lost</th><th className="r">Heat h lost</th><th>Daily</th>
            </tr>
          </thead>
          <tbody>
            {months.length === 0 && <tr><td colSpan={9} className="muted">The record starts tomorrow.</td></tr>}
            {[...months].reverse().map((m) => {
              const pct = m.rain_pct_of_normal_pro_rata;
              return (
                <tr key={m.month}>
                  <td><a href={`${base}/archive/monthly/${m.month}.md`}>{m.month}</a></td>
                  <td className="r num">{m.days_recorded}</td>
                  <td className="r num">{m.rain_mm}</td>
                  <td>
                    {pct === null ? <span className="muted">–</span> : (
                      <span className="ofnorm" title={`${Math.trunc(pct)} % of the normal rain for these days`}>
                        <span className="ofnorm-bar"><span style={{ width: `${Math.min(100, pct / 2)}%` }} /><i /></span>
                        <span className="num">{Math.trunc(pct)} %</span>
                      </span>
                    )}
                  </td>
                  <td className="r num">{m.heavy_rain_days}</td>
                  <td className="r num">{m.exceptional_rain_days}</td>
                  <td className="r num">{m.lost_hours_concrete}</td>
                  <td className="r num">{m.lost_hours_labour}</td>
                  <td><a href={`${base}/archive/observed/${m.month}.csv`}>CSV</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fine">Bar: rain as a share of normal; the tick marks 100 %.</p>
    </section>
  );
}

export function SitePage({ slug }: { slug: string }) {
  const site = useSite(slug);
  const [sel, setSel] = useState(0);
  const [chosen, setChosen] = useView();
  const name = site.state === "ready" ? site.data.briefing.site : slug;
  useEffect(() => {
    document.title = `${name} · Site weather`;
  }, [name]);

  if (site.state === "loading") return <p className="state">Loading the forecast…</p>;
  if (site.state === "error") {
    return (
      <div className="page">
        <h1>No site weather for “{slug}”</h1>
        <p className="lede">The forecast for this site could not be loaded ({site.message}).</p>
        <p><a className="btn" href="#/site-weather">All sites</a></p>
      </div>
    );
  }

  const { briefing, months, thresholds } = site.data;
  const day = briefing.days[sel] ?? briefing.days[0];
  if (!day) return <p className="state">This briefing has no days.</p>;
  const ev = day.everyday;
  const view: View = ev ? chosen : "construction";       // briefings from before the everyday advice: trades only
  const [start, end] = ev && view === "everyday" ? workingHours(ev.hours) : workingHours(briefing.working);
  const [before, mark, after] = splitHeadline(ev && view === "everyday" ? ev.headline : day.headline);
  const extras = ev && view === "everyday" ? ev.extras : day.extras;
  const f = day.facts;
  const alertAt = stormAlert(briefing.days, sel);
  const alert = alertAt >= 0 ? briefing.days[alertAt] : undefined;
  const base = dataUrl(`site-weather/${slug}`);
  const issued = briefing.issued.split(" ")[1] ?? briefing.issued;

  return (
    <div className="page site">
      <div className="site-top">
        <div className="stack" style={{ gap: 6 }}>
          <a className="eyebrow back" href="#/site-weather">← All sites</a>
          <h1>{briefing.site}</h1>
          {ev && <ViewSwitch view={view} onChange={setChosen} />}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>Issued {briefing.issued.split(" ")[0]} at {issued} · refreshed every morning</span>
      </div>

      <div className="site-grid">
        <section className={`hero sky-${sky(day, thresholds?.heat_wbgt_moderate_work_acclimatised_C.continuous)}`} aria-label={`${view === "everyday" ? "Your day" : "Site note"} for ${day.day}`}>
          <div className="hero-top">
            <span className="eyebrow">{view === "everyday" ? "Your day" : "Site note"} · {sel === 0 ? "Today" : day.day.split(" ")[0]}</span>
            <span className="eyebrow">{day.day.split(" ").slice(1).join(" ")}</span>
          </div>
          <p className="hero-head">{before}{mark && <mark>{mark}</mark>}{after}</p>
          {ev && view === "everyday" ? (
            <>
              <p className="hero-sub">
                Rain {f.rain_mm.toFixed(0)} mm · {f.rain_chance}% chance · storms {f.storm} · heat stress (WBGT) up to {f.wbgt_peak.toFixed(0)} °C in the sun
              </p>
              <WorkdayArc day={day} start={start} end={end} rows={ev.rows} noun="activities fine" ends={["Morning", "Evening"]} />
            </>
          ) : (
            <>
              <p className="hero-sub">
                Rain {f.rain_mm.toFixed(0)} mm · {f.rain_chance}% chance · heat (WBGT) up to {f.wbgt_peak.toFixed(0)} °C · gusts {f.gust_hook_max.toFixed(0)} m/s at hook height
              </p>
              <WorkdayArc day={day} start={start} end={end} />
            </>
          )}
        </section>

        <div className="side">
          <WeekStrip days={briefing.days} selected={sel} onSelect={setSel} view={view} />
          {alert && (
            <section className="alert" aria-label="Storm warning">
              <span className="alert-when"><i />{alert.day}{alert.facts.storm_from && ` · from ${alert.facts.storm_from}:00`}</span>
              <div className="alert-body">
                <div className="stack" style={{ gap: 4 }}>
                  <h2>Storms likely</h2>
                  <p>{view === "everyday" && alert.everyday ? alert.everyday.headline : alert.headline}</p>
                </div>
                <Icon.storm size={28} />
              </div>
              <button type="button" className="btn" onClick={() => setSel(alertAt)}>Show this day <Icon.arrowRight /></button>
            </section>
          )}
          {extras.length > 0 && (
            <section className="card card-pad notes" aria-label="Also on this day">
              <span className="eyebrow">Also {sel === 0 ? "today" : `on ${day.day.split(" ")[0]}`}</span>
              <ul>{extras.map((x) => <li key={x}><Icon.info />{x}</li>)}</ul>
            </section>
          )}
        </div>
      </div>

      {ev && view === "everyday" ? (
        <ActivityTable ev={ev} day={day.day} />
      ) : (
        <>
        <Gauges day={day} th={thresholds} />
        <TradeTable day={day} working={briefing.working} />

        <section className="card card-pad stack" aria-label="Meteogram">
          <div className="card-head">
            <h2>Seven-day meteogram</h2>
            <div className="chips">
              <a className="chip" href={`${base}/site_meteogram_concrete.png`}>Concrete, asphalt, painting, earthworks</a>
              <a className="chip" href={`${base}/site_meteogram_lifting.png`}>Cranes and height</a>
              <a className="chip" href={`${base}/site_meteogram_heat.png`}>Heat and labour</a>
            </div>
          </div>
          <figure className="figure">
            <img src={`${base}/site_meteogram_latest.png`} onError={hideIfMissing} loading="lazy"
              alt="Seven-day site meteogram: heat, rain and storms, wind, sun and cloud, concrete and painting, go hours per trade, daily summary and regional maps" />
          </figure>
          <p className="fine">
            <a href={`${base}/site_forecast_latest.csv`}>Hourly numbers and per-trade status (CSV)</a> ·{" "}
            <a href={dataUrl("site-weather/thresholds.json")}>Thresholds used</a> ·{" "}
            <a href={`${base}/archive/forecasts/`}>Forecasts as issued</a>
          </p>
        </section>

        <section className="card card-pad stack" aria-label="Cards to share">
          <div className="card-head">
            <h2>Cards to share</h2>
            <div className="chips">
              <a className="chip" href={`${base}/social/briefing_A4.pdf`}>Printable A4 (PDF)</a>
              <a className="chip" href={`${base}/social/today_9x16.png`}>Status / Stories</a>
              <a className="chip" href={`${base}/social/today_hours_4x5.png`}>Hour-by-hour</a>
              <a className="chip" href={`${base}/social/carousel.pdf`}>LinkedIn carousel</a>
              <a className="chip" href={`${base}/social/caption.txt`}>Caption</a>
            </div>
          </div>
          <div className="share-row">
            {[["today_4x5", "Today's site card"], ["week_4x5", "The week on site"], ["howto_4x5", "How to read the card"]].map(([f2, alt]) => (
              <figure key={f2} className="figure"><a href={`${base}/social/${f2}.png`}><img src={`${base}/social/${f2}.png`} alt={alt} onError={hideIfMissing} loading="lazy" /></a></figure>
            ))}
          </div>
        </section>

        <MonthlyRecord base={base} months={months} />
        </>
      )}

      <p className="fine">
        {view === "everyday"
          ? <>Advice from a weather forecast, not an official warning: follow warnings from the national weather service (in Uganda, UNMA) and
            local authorities. <a href={dataUrl("site-weather/thresholds.json")}>Limits used</a>. </>
          : <>Screening guidance from a weather forecast, not an instruction. The contract specification, crane manufacturer's limits and
            site health-and-safety plan take precedence. </>}
        Forecast and ERA5 data: Open-Meteo (open-meteo.com, CC BY 4.0).
      </p>
    </div>
  );
}
