import { useId, useState } from "react";
import { range, signed, type Stats } from "../stats";
import { LCZ_WORDS, PACKING_STOPS, TRAJECTORY_WORDS, lczCode } from "./logic";

/**
 * "Packing in": a slider from open land to packed low houses showing how much hotter the ground and roofs get (Local
 * Climate Zones), then how blocks that packed in since the first year warmed compared with blocks that were already
 * dense. Framed as how tightly buildings are packed, not who lives there.
 */
export function PackingIn({ stats }: { stats: Stats }) {
  const id = useId();
  const lcz = stats.charts.lcz;
  const traj = stats.charts.trajectories;
  const n = stats.numbers;
  const stops = PACKING_STOPS.map((code) => lcz.zones.find((z) => lczCode(z.name) === code)).filter((z) => z !== undefined);
  const [i, setI] = useState(stops.length - 1);
  const z = stops[Math.min(i, stops.length - 1)];
  if (!z || stops.length < 2) return null;
  const [a, b] = lcz.years;
  const open = stops[0]!.values[1];
  const lo = Math.min(-2, ...stops.map((s) => Math.min(...s.values))), hi = Math.max(7, ...stops.map((s) => Math.max(...s.values)));
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const words = LCZ_WORDS[lczCode(z.name)];
  const changes = traj.series.map((s) => ({ ...s, change: s.values[s.values.length - 1]! - s.values[0]! })).sort((x, y) => y.change - x.change);
  const most = Math.max(...changes.map((s) => s.change));
  const y0 = traj.years[0], y2 = traj.years[traj.years.length - 1];

  return (
    <div className="explore">
      <div className="explore-grid">
        <section className="explore-card" aria-labelledby={`${id}-t`}>
          <h3 id={`${id}-t`}>Packing in</h3>
          <p className="muted">Slide from open land to closely packed low houses and watch how hot the ground and roofs get.</p>
          <input className="pack-slider" type="range" min={0} max={stops.length - 1} step={1} value={i} onChange={(e) => setI(Number(e.target.value))}
            aria-label="How closely packed" aria-valuetext={words?.name ?? z.name} />
          <div className="pack-stops" aria-hidden="true">
            {stops.map((s, k) => (
              <button key={s.name} type="button" tabIndex={-1} className={k === i ? "on" : ""} onClick={() => setI(k)}>
                {LCZ_WORDS[lczCode(s.name)]?.name ?? s.name}
              </button>
            ))}
          </div>
          <div className="pack-now" aria-live="polite">
            <b>{words?.name ?? z.name}</b>
            {words && <p>{words.looks}</p>}
            <div className="thermo" aria-hidden="true">
              <span className="thermo-zero" style={{ left: `${pos(0)}%` }} />
              <span className={`thermo-fill ${z.values[1] >= 0 ? "hot" : "cool"}`}
                style={{ left: `${Math.min(pos(0), pos(z.values[1]))}%`, width: `${Math.abs(pos(z.values[1]) - pos(0))}%` }} />
              <span className="thermo-then" style={{ left: `${pos(z.values[0])}%` }} />
              <span className="thermo-label" style={{ left: `${pos(0)}%` }}>city average</span>
            </div>
            <p>
              Ground and roofs: <b>{signed(z.values[1])} °C</b> compared with the city average in {b}
              {i > 0 && <>, <b>{(z.values[1] - open).toFixed(1)} °C hotter</b> than open land</>}.
              <span className="muted"> The thin mark is {a}.</span>
            </p>
          </div>
        </section>

        <section className="explore-card" aria-labelledby={`${id}-c`}>
          <h3 id={`${id}-c`}>Packing in heats a block fastest</h3>
          <p className="muted">Change in how hot blocks run compared with the rest of the city, {y0} to {y2}.</p>
          <ul className="traj-cards">
            {changes.map((s) => {
              const w = TRAJECTORY_WORDS[s.name];
              return (
                <li key={s.name} className={s.change === most ? "most" : ""}>
                  <span className="traj-name">{w?.name ?? s.name}</span>
                  <span className="traj-change">{signed(s.change)} °C</span>
                  <span className="traj-bar"><i style={{ width: `${(Math.max(0, s.change) / Math.max(most, 0.01)) * 100}%` }} /></span>
                  <span className="traj-story">{w?.story} Now {signed(s.values[s.values.length - 1]!)} °C above the city average ({s.km2.toFixed(0)} km²).</span>
                </li>
              );
            })}
          </ul>
          <p className="callout">
            <b>It is the packing, not the people.</b> Settlements mapped by the slum dwellers' federation warmed {range(n.sdi_change, 2, (v, d) => v.toFixed(d))} °C
            since {y0}, less than other dense areas ({range(n.sdi_dense_change, 2, (v, d) => v.toFixed(d))} °C). What heats a block is filling in its open ground
            with closely packed roofs. Trees help: every extra tenth of ground under trees goes with surfaces about {n.cooling_per_10pct_canopy.toFixed(1)} °C cooler.{" "}
            <a href="#/atlas/trees">Where to plant</a>
          </p>
        </section>
      </div>
    </div>
  );
}
