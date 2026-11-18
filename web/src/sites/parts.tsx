import { useState } from "react";
import { Icon, StatusPill } from "../components/ui";
import type { DayBriefing, SiteThresholds, TradeRow } from "../types";
import {
  hourShares, hourTone, limitTone, scale, shareTone, STATUS_WORD, statusTone, weekSummary, workableShare, type Tone,
} from "./logic";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const TONE_WORD: Record<Tone, string> = { good: "go", warning: "with care", critical: "stop" };

// ---------------------------------------------------------------- workday arc

/**
 * The working day as an arc (like a sun path): one dot per working hour, coloured by how many
 * trades can work then. Hover or focus a dot for the count.
 */
export function WorkdayArc({ day, start, end }: { day: DayBriefing; start: number; end: number }) {
  const shares = hourShares(day.rows);
  const [active, setActive] = useState<number | null>(null);
  const W = 640, H = 150, x0 = 28, x1 = W - 28, base = 120, amp = 88;
  const at = (t: number) => ({ x: x0 + (x1 - x0) * t, y: base - amp * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) });
  const tOf = (hour: number) => (hour + 0.5 - start) / (end - start);
  const curve = Array.from({ length: 61 }, (_, i) => at(i / 60)).map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const breaks = shares.slice(1).filter((s, i) => s.hour !== (shares[i]?.hour ?? 0) + 1).map((s) => s.hour - 1);
  const storm = day.facts.storm_from ? Number(day.facts.storm_from) : null;
  const shown = active === null ? null : shares[active];

  return (
    <div className="arc">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Trades that can work, hour by hour: ${shares.map((s) => `${hh(s.hour)} ${s.go} of ${s.total}`).join(", ")}`}>
        <line x1={0} x2={W} y1={base} y2={base} className="arc-ground" />
        <path d={curve} className="arc-path" />
        {storm !== null && storm >= start && storm < end && (
          <g className="arc-storm">
            <line x1={at(tOf(storm) - 0.5 / (end - start)).x} x2={at(tOf(storm) - 0.5 / (end - start)).x} y1={14} y2={base} />
          </g>
        )}
        {breaks.map((b) => {
          const p = at(tOf(b));
          return <text key={b} x={p.x} y={p.y - 14} className="arc-break">lunch</text>;
        })}
        {shares.map((s, i) => {
          const p = at(tOf(s.hour));
          return (
            <circle
              key={s.hour} cx={p.x} cy={p.y} r={active === i ? 9 : 7} className={`arc-dot dot-${shareTone(s)}`}
              tabIndex={0} aria-label={`${hh(s.hour)}: ${s.go} of ${s.total} trades can work`}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
            />
          );
        })}
      </svg>
      {shown && (
        <div className="arc-tip" style={{ left: `${(at(tOf(shown.hour)).x / W) * 100}%`, top: `${(at(tOf(shown.hour)).y / H) * 100}%` }} role="status">
          <b>{hh(shown.hour)}</b> · {shown.go} of {shown.total} trades can work
        </div>
      )}
      <div className="arc-foot">
        <span><b>{hh(start)}</b><small>Start</small></span>
        <span className="arc-mid">
          {storm !== null && day.facts.storm !== "low"
            ? <><Icon.storm size={16} /> Storms {day.facts.storm} from {hh(storm)}</>
            : <><Icon.sun /> No storm risk</>}
        </span>
        <span className="r"><b>{hh(end)}</b><small>Finish</small></span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- week strip

const short = (day: string, i: number) => (i === 0 ? "Today" : day.split(" ")[0]?.slice(0, 3) ?? day);

/** The week as bars of workable trade-hours; choosing a day switches the page to it. */
export function WeekStrip({ days, selected, onSelect }: { days: DayBriefing[]; selected: number; onSelect: (i: number) => void }) {
  return (
    <section className="card card-pad week" aria-label="This week">
      <div className="card-head">
        <h2>This week</h2>
        <span className="muted week-sum">{weekSummary(days)}</span>
      </div>
      <div className="week-bars" role="group" aria-label="Choose a day">
        {days.map((d, i) => {
          const share = workableShare(d);
          const pct = Math.round(share * 100);
          return (
            <button
              key={d.date} type="button" className="wk" aria-pressed={i === selected} onClick={() => onSelect(i)}
              aria-label={`${d.day}: ${pct}% of trade hours workable, storms ${d.facts.storm}`}
            >
              <span className="wk-val num">{pct}%</span>
              <span className="wk-track"><span className="wk-bar" style={{ height: `${Math.max(6, share * 100)}%` }} /></span>
              <span className={`wk-storm storm-${d.facts.storm}`} aria-hidden="true">{d.facts.storm !== "low" && <Icon.storm size={15} />}</span>
              <span className="wk-day">{short(d.day, i)}</span>
            </button>
          );
        })}
      </div>
      <p className="fine">Bars: share of trade-hours with no weather limit. <Icon.storm size={12} /> storms possible or likely.</p>
    </section>
  );
}

// ---------------------------------------------------------------- gauges

interface GaugeSpec {
  label: string;
  icon: React.ReactNode;
  value: number;
  unit: string;
  min: number;
  max: number;
  caution?: number;
  stop?: number;
  /** Which limit the ticks are, e.g. "Crane". */
  limitOf?: string;
  digits?: number;
}

function Gauge({ g }: { g: GaugeSpec }) {
  const tone = g.caution !== undefined && g.stop !== undefined ? limitTone(g.value, g.caution, g.stop) : null;
  const state = tone === null ? "" : tone === "good" ? "Below caution" : tone === "warning" ? "Above caution" : "Above stop";
  return (
    <div className="gauge">
      <div className="gauge-text">
        <span className="eyebrow">{g.icon}{g.label}</span>
        <span className="gauge-val">{g.value.toFixed(g.digits ?? 0)}<small>{g.unit}</small></span>
        {tone && <span className={`gauge-state t-${tone}`}>{state}</span>}
        {g.caution !== undefined && g.stop !== undefined && (
          <span className="gauge-lim">{g.limitOf}: caution {g.caution} · stop {g.stop}{g.unit.trim() === "%" ? " %" : ` ${g.unit.trim()}`}</span>
        )}
      </div>
      <div className={`meter${tone ? ` m-${tone}` : ""}`} aria-hidden="true">
        <span className="meter-fill" style={{ height: `${scale(g.value, g.min, g.max) * 100}%` }} />
        {g.caution !== undefined && <span className="meter-tick" style={{ bottom: `${scale(g.caution, g.min, g.max) * 100}%` }} />}
        {g.stop !== undefined && <span className="meter-tick stop" style={{ bottom: `${scale(g.stop, g.min, g.max) * 100}%` }} />}
      </div>
    </div>
  );
}

/** The day's conditions against the site's own limits (from thresholds_site.json). */
export function Gauges({ day, th }: { day: DayBriefing; th: SiteThresholds | null }) {
  const f = day.facts;
  const heat = th?.heat_wbgt_moderate_work_acclimatised_C;
  const gauges: GaugeSpec[] = [
    { label: "Heat (WBGT)", icon: <Icon.heat />, value: f.wbgt_peak, unit: " °C", min: 18, max: 36, caution: heat?.continuous, stop: heat?.work25_rest75, limitOf: "Moderate work", digits: 0 },
    { label: `Gusts at ${th?.crane.hook_height_m ?? 30} m`, icon: <Icon.wind />, value: f.gust_hook_max, unit: " m/s", min: 0, max: 25, caution: th?.crane.gust_caution_ms, stop: th?.crane.gust_stop_ms, limitOf: "Crane" },
    { label: "Rain chance", icon: <Icon.drop />, value: f.rain_chance, unit: "%", min: 0, max: 100, caution: th?.concrete.rain_prob_caution_pct, stop: th?.concrete.rain_prob_stop_pct, limitOf: "Concrete" },
    { label: "Rain", icon: <Icon.drop />, value: f.rain_mm, unit: " mm", min: 0, max: 30, caution: th?.earthworks.rain_prev24h_caution_mm, stop: th?.earthworks.rain_prev24h_stop_mm, limitOf: "Earthworks", digits: f.rain_mm < 10 ? 1 : 0 },
  ];
  return (
    <section className="card gauges" aria-label="Conditions">
      {gauges.map((g) => <Gauge key={g.label} g={g} />)}
    </section>
  );
}

// ---------------------------------------------------------------- trade table

function HourCells({ row }: { row: TradeRow }) {
  return (
    <div className="cells" role="list" aria-label={`${row.trade}, hour by hour`}>
      {row.hours.map(([h, s], i) => {
        const gap = i > 0 && h !== (row.hours[i - 1]?.[0] ?? h) + 1;
        const tone = hourTone(s);
        return (
          <span key={h} role="listitem" className={`cell c-${tone}${gap ? " gap" : ""}`} title={`${hh(h)}: ${TONE_WORD[tone]}`}>
            <span className="sr-only">{hh(h)} {TONE_WORD[tone]}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Every trade for the day: status, hour-by-hour go/care/stop, and what to do. */
export function TradeTable({ day, working }: { day: DayBriefing; working: string }) {
  const hours = day.rows[0]?.hours ?? [];
  return (
    <section className="card card-pad trades" aria-label="By trade">
      <div className="card-head">
        <div className="stack" style={{ gap: 2 }}>
          <h2>By trade</h2>
          <span className="muted" style={{ fontSize: 13 }}>{day.day} · working hours {working}</span>
        </div>
        <div className="legend-row" aria-label="Key">
          <span><span className="cell c-good" />Go</span>
          <span><span className="cell c-warning" />With care</span>
          <span><span className="cell c-critical" />Stop</span>
        </div>
      </div>
      <div className="trade-grid">
        <div className="trade-hours" aria-hidden="true">
          <span />
          <div className="cells head">
            {hours.map(([h], i) => {
              const gap = i > 0 && h !== (hours[i - 1]?.[0] ?? h) + 1;
              return <span key={h} className={`cell${gap ? " gap" : ""}`}>{String(h).padStart(2, "0")}</span>;
            })}
          </div>
          <span />
        </div>
        {[...day.rows].sort((a, b) => b.hours.filter(([, s]) => s === 2).length - a.hours.filter(([, s]) => s === 2).length || a.go_hours - b.go_hours).map((r) => (
          <div className="trade" key={r.key}>
            <div className="trade-name">
              <b>{r.trade}</b>
              <StatusPill tone={statusTone(r.status)}>{r.status === "GO" ? STATUS_WORD.GO : r.label.replace(/^go /, "Go ").replace(/^STOP/, "Stop")}</StatusPill>
            </div>
            <HourCells row={r} />
            <span className="trade-go num" title="Go hours">{r.go_hours} h</span>
            <p className="trade-act">
              {r.causes.length > 0 && r.key !== "labour" && <span className="muted">Limited by {r.causes.join(", ")}. </span>}
              {r.action}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
