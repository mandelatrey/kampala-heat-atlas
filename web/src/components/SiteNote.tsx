import { hourCells, splitHeadline, STATUS_PILL, tradeTitle, workingSpan } from "../lib";
import type { Briefing, TradeRow } from "../types";

function TradeCard({ row }: { row: TradeRow }) {
  const pill = STATUS_PILL[row.status];
  const why = row.causes.length && row.key !== "labour" ? `Limited by ${row.causes.join(", ")}. ` : "";
  return (
    <article className="tc">
      <div className="tc-top">
        <span className="eyebrow">{row.trade}</span>
        <span className={`pill ${pill.cls}`}><i />{pill.word}</span>
      </div>
      <h3>{tradeTitle(row)}</h3>
      <div className="hrs" aria-label={`${row.trade} by hour`}>
        {hourCells(row.hours).map((c) => {
          const hh = String(c.hour).padStart(2, "0");
          return (
            <span key={c.hour} className={`h s${c.status}${c.gapBefore ? " gap" : ""}`} title={`${hh}:00`}>{hh}</span>
          );
        })}
      </div>
      <p>{why + row.action}</p>
    </article>
  );
}

/** Today's site note: headline, fact chips, a card per limited trade, extras, then the next days. */
export function SiteNote({ briefing }: { briefing: Briefing }) {
  const [today, ...rest] = briefing.days;
  if (!today) return <p className="lede">No forecast in this briefing.</p>;
  const f = today.facts;
  const [before, mark, after] = splitHeadline(today.headline);
  const limited = today.rows.filter((r) => r.status !== "GO");
  const clear = today.rows.filter((r) => r.status === "GO").map((r) => r.trade);
  const chips = [
    `Rain ${f.rain_mm.toFixed(0)} mm · ${f.rain_chance}%`,
    `Storms ${f.storm}${f.storm_from ? ` from ${f.storm_from}:00` : ""}`,
    `Heat (WBGT) ${f.wbgt_peak.toFixed(0)} °C`,
    `Gusts ${f.gust_hook_max.toFixed(0)} m/s at hook height`,
  ];
  const issuedAt = briefing.issued.split(" ")[1] ?? briefing.issued;

  return (
    <div className="sn">
      <p className="eyebrow">Site note · {today.day} · issued {issuedAt}</p>
      <h2 className="hl">{before}{mark && <mark>{mark}</mark>}{after}</h2>
      <div className="chips">{chips.map((c) => <span key={c}>{c}</span>)}</div>
      <div className="tgrid">
        {limited.map((r) => <TradeCard key={r.key} row={r} />)}
        {clear.length > 0 && (
          <article className="tc ok">
            <div className="tc-top">
              <span className="eyebrow">No weather limits</span>
              <span className="pill go"><i />Go</span>
            </div>
            <h3>{clear.join(", ")}</h3>
            <p>Work as planned; keep an eye on the sky.</p>
          </article>
        )}
      </div>
      {today.extras.length > 0 && <ul className="extras">{today.extras.map((x) => <li key={x}>{x}</li>)}</ul>}
      <p className="eyebrow" style={{ marginTop: 8 }}>Next days</p>
      <div className="steps">
        {rest.slice(0, 3).map((d) => (
          <article className="step" key={d.date}>
            <span className="eyebrow">{d.day}</span>
            <p>{d.headline}</p>
          </article>
        ))}
      </div>
      <p className="fine">
        Hours are go hours, {workingSpan(briefing.working)} with lunch excluded; 08-13 means from 08:00 until the lunch
        break. Screening guidance from a forecast: the contract, crane manufacturer's limits and site H&amp;S plan come first.
      </p>
    </div>
  );
}
