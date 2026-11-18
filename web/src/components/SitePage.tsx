import { useEffect } from "react";
import { useSite } from "../data";
import { dataUrl } from "../lib";
import type { MonthRow } from "../types";
import { SiteNote } from "./SiteNote";

function MonthlyTable({ base, months }: { base: string; months: MonthRow[] }) {
  return (
    <div className="wrap">
      <table>
        <thead>
          <tr>
            <th>month</th><th>days</th><th>rain mm</th><th>of normal</th><th>heavy days</th><th>exceptional days</th>
            <th>concrete h lost</th><th>labour (heat) h lost</th><th>daily</th>
          </tr>
        </thead>
        <tbody>
          {months.length === 0 && <tr><td colSpan={9}>The record starts tomorrow.</td></tr>}
          {[...months].reverse().map((m) => (
            <tr key={m.month}>
              <td><a href={`${base}/archive/monthly/${m.month}.md`}>{m.month}</a></td>
              <td>{m.days_recorded}</td>
              <td>{m.rain_mm}</td>
              <td>{m.rain_pct_of_normal_pro_rata === null ? "–" : `${Math.trunc(m.rain_pct_of_normal_pro_rata)} %`}</td>
              <td>{m.heavy_rain_days}</td>
              <td>{m.exceptional_rain_days}</td>
              <td>{m.lost_hours_concrete}</td>
              <td>{m.lost_hours_labour}</td>
              <td><a href={`${base}/archive/observed/${m.month}.csv`}>CSV</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Hide an image the pipeline has not produced (images are deployed by CI, not committed). */
const hideIfMissing = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.hidden = true;
};

export function SitePage({ slug }: { slug: string }) {
  const site = useSite(slug);
  const name = site.state === "ready" ? site.data.briefing.site : slug;
  useEffect(() => {
    document.title = `Site Weather · ${name}`;
  }, [name]);

  if (site.state === "loading") return <p className="lede">Loading the forecast…</p>;
  if (site.state === "error") {
    return (
      <section>
        <h1>No site weather for “{slug}”</h1>
        <p className="lede">The forecast for this site could not be loaded ({site.message}).</p>
        <p className="lede"><a href="#/site-weather">All sites</a></p>
      </section>
    );
  }

  const { briefing, months } = site.data;
  const base = dataUrl(`site-weather/${slug}`);
  return (
    <>
      <h1>Site weather · {briefing.site}</h1>
      <p className="lede">
        For contractors and site managers: the next seven days as workable hours per trade, with a short site note,
        refreshed every morning at 06:00. Every day is also archived, so the record of what the weather did, month by
        month and compared with the site's 1991-2020 climate, builds up on its own.
      </p>
      <section><SiteNote briefing={briefing} /></section>
      <section>
        <h2>Seven-day site meteogram</h2>
        <img
          src={`${base}/site_meteogram_latest.png`}
          alt="Seven-day site meteogram: heat, rain and storms, wind, sun and cloud, concrete and painting, go hours per trade, daily summary and regional maps"
          onError={hideIfMissing}
        />
        <p className="lede">
          Trade panels, the same forecast with only what each trade needs:{" "}
          <a href={`${base}/site_meteogram_concrete.png`}>concrete, asphalt, painting and earthworks</a> ·{" "}
          <a href={`${base}/site_meteogram_lifting.png`}>cranes and work at height</a> ·{" "}
          <a href={`${base}/site_meteogram_heat.png`}>heat and outdoor labour</a>
        </p>
        <p className="lede">
          <a href={`${base}/site_forecast_latest.csv`}>Hourly numbers and per-trade status (CSV)</a> ·{" "}
          <a href={dataUrl("site-weather/thresholds.json")}>Thresholds used</a> ·{" "}
          <a href={`${base}/archive/forecasts/`}>Forecasts as issued</a>
        </p>
      </section>
      <section>
        <h2>Cards to share</h2>
        <p className="lede">
          The same forecast as images for WhatsApp, LinkedIn, X, Instagram and Facebook, refreshed each morning.{" "}
          <a href={`${base}/social/today_4x5.png`}>Today's briefing</a> ·{" "}
          <a href={`${base}/social/today_9x16.png`}>Today (Status / Stories)</a> ·{" "}
          <a href={`${base}/social/today_hours_4x5.png`}>Hour-by-hour grid</a> ·{" "}
          <a href={`${base}/social/briefing_A4.pdf`}><strong>Printable A4 briefing (PDF)</strong></a> ·{" "}
          <a href={`${base}/social/week_4x5.png`}>The week</a> ·{" "}
          <a href={`${base}/social/carousel.pdf`}>LinkedIn carousel (PDF)</a> ·{" "}
          <a href={`${base}/social/caption.txt`}>Caption</a>
        </p>
        <div className="cards">
          <img src={`${base}/social/today_4x5.png`} alt="Today's site card" onError={hideIfMissing} />
          <img src={`${base}/social/week_4x5.png`} alt="The week on site card" onError={hideIfMissing} />
          <img src={`${base}/social/howto_4x5.png`} alt="How to read the card" onError={hideIfMissing} />
        </div>
      </section>
      <section>
        <h2>Monthly record</h2>
        <p className="lede">
          Rain against the 1991-2020 normal, heavy and exceptional days, and working hours lost. Days start as
          preliminary model analysis and are replaced by ERA5 about a week later. Useful as supporting evidence for
          extension-of-time claims (FIDIC 2017 Sub-Clause 8.5); a site rain gauge and the daily diary remain the primary
          record.
        </p>
        <MonthlyTable base={base} months={months} />
      </section>
    </>
  );
}
