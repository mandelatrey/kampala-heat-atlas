// The atlas module charts, drawn from stats.json (scripts/14c_atlas_stats.py) at the size they are shown.
import { useEffect, useState, type ReactNode } from "react";
import { linear, niceDomain, niceTicks, spreadLabels, textWidth, useWidth } from "./chartkit";
import { hourLabel, num, signed, type Charts } from "./stats";

const NARROW = 520;

function Frame(props: { title: string; note?: ReactNode; source: string; href: string; children: (width: number) => ReactNode }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{props.title}</span>
        {props.note && <span className="chart-note">{props.note}</span>}
      </figcaption>
      <div className="chart-body" ref={ref}>{props.children(width)}</div>
      <p className="chart-src">Data: <a href={props.href} download>{props.source}</a></p>
    </figure>
  );
}

function Key({ items }: { items: { color: string; label: ReactNode; line?: boolean }[] }) {
  return (
    <ul className="chart-key">
      {items.map((it, i) => <li key={i}><i className={it.line ? "line" : undefined} style={{ background: it.line ? undefined : it.color, borderColor: it.color }} />{it.label}</li>)}
    </ul>
  );
}

function YAxis({ ticks, y, x0, x1, fmt = (t: number) => num(t) }: { ticks: number[]; y: (v: number) => number; x0: number; x1: number; fmt?: (t: number) => string }) {
  return (
    <g className="axis">
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={x0} x2={x1} y1={y(t)} y2={y(t)} />
          <text x={x0 - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
    </g>
  );
}

/** Lines over the three epochs with labels at the right-hand end (a key underneath on narrow screens). */
function SlopeLines(props: {
  width: number; years: number[]; series: { name: string; color: string; values: number[] }[];
  fromZero: boolean; unit: string; label: (s: { name: string; values: number[] }) => string; ariaLabel: string;
}) {
  const { width: w, years, series } = props;
  const narrow = w < NARROW;
  const labelW = narrow ? 0 : Math.min(240, Math.max(...series.map((s) => textWidth(props.label(s)))) + 20);
  const H = 310, top = 26, bottom = 26, left = 46;
  const all = series.flatMap((s) => s.values);
  const [d0, d1] = niceDomain(props.fromZero ? 0 : Math.min(...all), Math.max(...all));
  const y = linear(d0, d1, H - bottom, top);
  const right = w - labelW - 12;
  const x = (i: number) => left + 16 + (i * (right - left - 32)) / (years.length - 1);
  const ends = spreadLabels(series.map((s) => y(s.values[s.values.length - 1]!)), 15, top, H - bottom);
  return (
    <>
      <svg width={w} height={H} role="img" aria-label={props.ariaLabel}>
        <YAxis ticks={niceTicks(d0, d1)} y={y} x0={left} x1={right} />
        <text className="unit" x={left - 6} y={10} textAnchor="end">{props.unit}</text>
        {years.map((yr, i) => <text key={yr} className="axis-x" x={x(i)} y={H - 6} textAnchor="middle">{yr}</text>)}
        {series.map((s, k) => {
          const last = s.values.length - 1;
          return (
            <g key={s.name}>
              <polyline fill="none" stroke={s.color} strokeWidth={2.5} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={4.5} fill={s.color} className="dot">
                  <title>{`${s.name}, ${years[i]}: ${num(v, 1)} ${props.unit}`}</title>
                </circle>
              ))}
              {!narrow && (
                <>
                  {Math.abs(ends[k]! - y(s.values[last]!)) > 2 && (
                    <line className="leader" x1={x(last) + 6} y1={y(s.values[last]!)} x2={right + 8} y2={ends[k]} />
                  )}
                  <text className="end-label" x={right + 12} y={ends[k]} dy="0.32em">{props.label(s)}</text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      {narrow && <Key items={series.map((s) => ({ color: s.color, label: props.label(s) }))} />}
    </>
  );
}

export function LandcoverChart({ c, href }: { c: Charts["landcover"]; href: string }) {
  const [y0, y2] = [c.years[0], c.years[c.years.length - 1]];
  return (
    <Frame title="Area of each land-cover class" note={`${y0}, ${c.years[1]} and ${y2}; label: ${y2} area (change since ${y0})`} source={c.source} href={href}>
      {(w) => (
        <SlopeLines width={w} years={c.years} fromZero unit="km²" ariaLabel={`Line chart of land-cover area by class, ${y0} to ${y2}`}
          series={c.classes.map((k) => ({ name: k.name, color: k.color, values: k.km2 }))}
          label={(s) => `${s.name} ${num(s.values[s.values.length - 1]!)} km² (${signed(s.values[s.values.length - 1]! - s.values[0]!, 0)})`} />
      )}
    </Frame>
  );
}

export function TrajectoryChart({ c, href }: { c: Charts["trajectories"]; href: string }) {
  return (
    <Frame title="Surface heat by settlement trajectory" note="mean °C above the city land mean; label: change since the first epoch" source={c.source} href={href}>
      {(w) => (
        <SlopeLines width={w} years={c.years} fromZero={false} unit="°C" ariaLabel="Line chart of mean surface-heat anomaly by settlement trajectory over three epochs"
          series={c.series} label={(s) => `${s.name} (${signed(s.values[s.values.length - 1]! - s.values[0]!)} °C)`} />
      )}
    </Frame>
  );
}

export function LczChart({ c, href }: { c: Charts["lcz"]; href: string }) {
  const [a, b] = c.years;
  return (
    <Frame title="Surface heat by Local Climate Zone" note="°C above or below the city land mean" source={c.source} href={href}>
      {(w) => {
        const rowH = 26, top = 8, bottom = 28;
        const labelW = Math.min(w < NARROW ? 118 : 150, Math.max(...c.zones.map((z) => textWidth(z.name))) + 10);
        const H = top + c.zones.length * rowH + bottom;
        const all = c.zones.flatMap((z) => z.values);
        const [d0, d1] = niceDomain(Math.min(0, ...all), Math.max(0, ...all), 6);
        const x = linear(d0, d1, labelW + 8, w - 10);
        const rowY = (i: number) => top + i * rowH + rowH / 2;
        const zones = [...c.zones].reverse();               // hottest at the top
        return (
          <>
            <Key items={[{ color: c.series_colors[0], label: String(a) }, { color: c.series_colors[1], label: String(b) }]} />
            <svg width={w} height={H} role="img" aria-label={`Dumbbell chart of surface heat by Local Climate Zone, ${a} and ${b}`}>
              <g className="axis">
                {niceTicks(d0, d1, 6).map((t) => (
                  <g key={t}>
                    <line className={t === 0 ? "zero" : "grid"} x1={x(t)} x2={x(t)} y1={top} y2={H - bottom} />
                    <text x={x(t)} y={H - 10} textAnchor="middle">{signed(t, 0)}</text>
                  </g>
                ))}
              </g>
              {zones.map((z, i) => (
                <g key={z.name}>
                  <text className="row-label" x={labelW} y={rowY(i)} dy="0.32em" textAnchor="end">{z.name}</text>
                  <line className="bar-link" x1={x(z.values[0])} x2={x(z.values[1])} y1={rowY(i)} y2={rowY(i)} />
                  {z.values.map((v, k) => (
                    <circle key={k} className="dot" cx={x(v)} cy={rowY(i)} r={5.5} fill={c.series_colors[k as 0 | 1]}>
                      <title>{`${z.name}, ${c.years[k]}: ${signed(v)} °C`}</title>
                    </circle>
                  ))}
                </g>
              ))}
            </svg>
          </>
        );
      }}
    </Frame>
  );
}

export function SolarChart({ c, href }: { c: Charts["solar"]; href: string }) {
  return (
    <Frame title="Rooftop generation under adoption scenarios" note="TWh a year, technical potential" source={c.source} href={href}>
      {(w) => {
        const H = 280, top = 18, bottom = 28, left = 40, right = w - 8;
        const bench = c.benchmark.gwh / 1000;
        const [, d1] = niceDomain(0, Math.max(bench, ...c.scenarios.map((s) => s.largest_first_gwh / 1000)));
        const y = linear(0, d1, H - bottom, top);
        const band = (right - left) / c.scenarios.length;
        const bw = Math.min(34, band * 0.36);
        return (
          <>
            <Key items={[
              { color: c.series_colors[0], label: "largest roofs first" }, { color: c.series_colors[1], label: "roofs at random" },
              { color: "var(--ink)", label: `${c.benchmark.label}: ${num(bench, 1)} TWh`, line: true },
            ]} />
            <svg width={w} height={H} role="img" aria-label="Bar chart of rooftop solar generation by adoption scenario, against national electricity sales">
              <YAxis ticks={niceTicks(0, d1)} y={y} x0={left} x1={right} />
              {c.scenarios.map((s, i) => {
                const cx = left + band * (i + 0.5);
                const bars = [s.largest_first_gwh, s.random_gwh];
                return (
                  <g key={s.adoption}>
                    {bars.map((v, k) => (
                      <rect key={k} x={cx + (k === 0 ? -bw - 2 : 2)} y={y(v / 1000)} width={bw} height={y(0) - y(v / 1000)} rx={3} fill={c.series_colors[k as 0 | 1]}>
                        <title>{`${s.adoption}, ${k === 0 ? "largest roofs first" : "roofs at random"}: ${num(v / 1000, 1)} TWh`}</title>
                      </rect>
                    ))}
                    <text className="axis-x" x={cx} y={H - 8} textAnchor="middle">{w < NARROW ? s.adoption.replace(" of roofs", "") : s.adoption}</text>
                  </g>
                );
              })}
              <line className="benchmark" x1={left} x2={right} y1={y(bench)} y2={y(bench)}>
                <title>{`${c.benchmark.label}: ${num(bench, 1)} TWh`}</title>
              </line>
            </svg>
          </>
        );
      }}
    </Frame>
  );
}

export function TreesChart({ c, href }: { c: Charts["trees"]; href: string }) {
  const panels = [
    { key: "people" as const, title: "Residents", fmt: (v: number) => num(Math.round(v / 1000) * 1000) },
    { key: "plantable_km2" as const, title: "Plantable land (km²)", fmt: (v: number) => num(v) },
  ];
  return (
    <Frame title="Residents and plantable land per priority class" source={c.source} href={href}>
      {(w) => {
        const side = w >= 560;
        const pw = side ? (w - 24) / 2 : w;
        return (
          <div className={`chart-panels${side ? " side" : ""}`}>
            {panels.map((p) => {
              const rowH = 30, top = 22, labelW = 74, valueW = 64;
              const H = top + c.classes.length * rowH;
              const max = Math.max(...c.classes.map((k) => k[p.key]));
              const x = linear(0, max, 0, pw - labelW - valueW);
              return (
                <svg key={p.key} width={pw} height={H} role="img" aria-label={`Bar chart: ${p.title.toLowerCase()} by tree-planting priority class`}>
                  <text className="panel-title" x={0} y={12}>{p.title}</text>
                  {c.classes.map((k, i) => (
                    <g key={k.name} transform={`translate(0 ${top + i * rowH})`}>
                      <text className="row-label" x={labelW - 8} y={rowH / 2} dy="0.32em" textAnchor="end">{k.name}</text>
                      <rect x={labelW} y={5} width={Math.max(1, x(k[p.key]))} height={rowH - 10} rx={3} fill={k.color}>
                        <title>{`${k.name} priority: ${p.fmt(k[p.key])}`}</title>
                      </rect>
                      <text className="value" x={labelW + x(k[p.key]) + 6} y={rowH / 2} dy="0.32em">{p.fmt(k[p.key])}</text>
                    </g>
                  ))}
                </svg>
              );
            })}
          </div>
        );
      }}
    </Frame>
  );
}

/** A wedge of the wind rose: centred on `deg` (from north, clockwise), `width` degrees wide, out to radius r. */
function wedge(cx: number, cy: number, r: number, deg: number, width: number): string {
  const a0 = ((deg - width / 2 - 90) * Math.PI) / 180, a1 = ((deg + width / 2 - 90) * Math.PI) / 180;
  return `M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 0 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`;
}

export function WindRose({ c, href, start }: { c: NonNullable<Charts["wind"]>; href: string; start: number }) {
  const [hour, setHour] = useState(start);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setHour((h) => (h + 1) % 24), 700);
    return () => window.clearInterval(t);
  }, [playing]);
  const h = c.hours.find((x) => x.hour === hour) ?? c.hours[0]!;
  const rmax = Math.max(...c.hours.flatMap((x) => x.freq));
  const day = hour >= 7 && hour < 19;
  return (
    <Frame title="Where the wind comes from, hour by hour" note={c.source_note} source={c.source} href={href}>
      {(w) => {
        const size = Math.min(w, 360), cx = size / 2, cy = size / 2 + 4, R = size / 2 - 34;
        const rings = niceTicks(0, rmax * 100, 3).filter((t) => t > 0);
        const step = 360 / c.sectors.length;
        return (
          <div className="wind">
            <div className="wind-controls">
              <button type="button" className="btn" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? "Pause" : "Play the day"}</button>
              <label className="wind-hour">
                <span className="num">{hourLabel(hour)}</span>
                <input type="range" min={0} max={23} value={hour} onChange={(e) => { setPlaying(false); setHour(Number(e.target.value)); }} aria-label="Hour of day, local time" />
              </label>
              <span className="muted">mean {num(h.speed, 1)} m/s</span>
            </div>
            <svg width={size} height={size + 8} role="img" aria-label={`Wind rose for ${hourLabel(hour)} local time`}>
              {rings.map((t) => (
                <g key={t} className="axis">
                  <circle className="grid" cx={cx} cy={cy} r={(t / 100 / rmax) * R} fill="none" />
                  <text x={cx + 3} y={cy - (t / 100 / rmax) * R - 3}>{num(t)} %</text>
                </g>
              ))}
              {h.freq.map((f, i) => f > 0 && (
                <path key={i} d={wedge(cx, cy, (f / rmax) * R, c.sectors[i]!, step - 2)} fill={day ? c.day_color : c.night_color} className="petal">
                  <title>{`from ${c.sectors[i]}°: ${num(f * 100)} % of hours`}</title>
                </path>
              ))}
              <text className="compass" x={cx} y={14} textAnchor="middle">N</text>
              <text className="compass" x={size - 6} y={cy} dy="0.32em" textAnchor="end">E</text>
              <text className="compass" x={cx} y={size + 2} textAnchor="middle">S · Lake Victoria</text>
              <text className="compass" x={6} y={cy} dy="0.32em">W</text>
            </svg>
          </div>
        );
      }}
    </Frame>
  );
}
