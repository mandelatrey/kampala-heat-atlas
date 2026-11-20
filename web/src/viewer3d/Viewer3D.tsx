import { useEffect, useMemo, useRef, useState } from "react";
import { RAMPS, SHADE_STOPS, type ColourKey } from "./colours";
import { canUseWebGL2, useDistrict, useDistricts } from "./data";
import { thinPlaces, usePlaces } from "../atlas/places";
import { Scene } from "./Scene";
import { clock, compass, DAYS, sunPosition, timestamp, type DayKey } from "./sun";
import type { DistrictMeta } from "./types";
import "./viewer3d.css";

const HOURS: [number, number] = [6.5, 18.5];

function NoWebGL({ detail }: { detail?: string }) {
  return (
    <div className="no3d" role="alert">
      <h2>Your browser couldn't start 3D graphics</h2>
      <p>
        The 3D model needs WebGL 2, which this browser has turned off or can't use with this graphics driver.
        {detail && <span className="muted"> ({detail})</span>}
      </p>
      <ul>
        <li>Open this page in <b>Safari</b> or <b>Chrome</b>.</li>
        <li>In Firefox: Settings → General → Performance, untick “Use recommended performance settings” and tick “Use hardware acceleration when available”, then restart Firefox.</li>
        <li><code>about:support</code> (Firefox) or <code>chrome://gpu</code> (Chrome) shows why WebGL is blocked.</li>
      </ul>
      <p className="muted">The <a href="#/atlas/cube">rotating model in the atlas</a> shows central Kampala without 3D graphics.</p>
    </div>
  );
}

function Stats({ meta }: { meta: DistrictMeta }) {
  const s = meta.stats;
  const tiles: [string, string, string][] = [
    ["Buildings", Math.round(s.buildings).toLocaleString("en-GB"), "in this 2 × 2 km district"],
    ["Mean height", `${s.mean_height_m.toFixed(1)} m`, "Overture, else Open Buildings 2.5D"],
    ["Sky view", s.ground_svf.toFixed(2), "share of sky seen from the ground (1 = open)"],
    ["Midday shade", `${s.ground_shade_hours_10_16.toFixed(1)} h`, "a day on open ground, 10:00–16:00"],
    ["Roof sun lost", `${s.roof_shading_loss_pct.toFixed(0)} %`, "to the shade of taller neighbours"],
    ["Weak breeze", `${s.wind_stagnant_share_pct.toFixed(0)} %`, "of open space, under the lake breeze"],
  ];
  return (
    <section className="card stats3d" aria-label={`${meta.label} in numbers`}>
      {tiles.map(([label, value, note]) => (
        <div className="stat3d" key={label}><span className="eyebrow">{label}</span><b>{value}</b><span>{note}</span></div>
      ))}
    </section>
  );
}

export function Viewer3D() {
  const districts = useDistricts();
  const [name, setName] = useState("cbd");
  const [colour, setColour] = useState<ColourKey>("kwh");
  const [day, setDay] = useState<DayKey>("21 Mar");
  const [hour, setHour] = useState(15);
  const [wind, setWind] = useState(true);
  const [shade, setShade] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const [glError, setGlError] = useState<string | null>(null);
  const [panel, setPanel] = useState(true);
  const webgl = useMemo(canUseWebGL2, []);

  const list = districts.state === "ready" ? districts.data : {};
  const meta = list[name] ?? Object.values(list)[0];
  const data = useDistrict(meta?.file);
  const placesLoad = usePlaces();
  const inDistrict = useMemo(() => {
    if (!meta || placesLoad.state !== "ready") return [];
    const [w, s, e, n] = meta.bounds;
    // the bigger places, spaced out: a district can hold dozens of OpenStreetMap names
    return thinPlaces(placesLoad.data.places.filter((p) => p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n));
  }, [meta, placesLoad]);

  useEffect(() => {
    document.title = "Kampala in 3D";
  }, []);

  // play: the sun runs through the day at a quarter hour per 120 ms of real time, so a slow
  // computer drops frames rather than slowing the day down
  const raf = useRef<number | null>(null);
  const hourRef = useRef(hour);
  hourRef.current = hour;
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now();
    const h0 = hourRef.current;
    const step = (now: number) => {
      const h = Math.min(h0 + Math.floor((now - t0) / 120) * 0.25, HOURS[1]);
      if (h !== hourRef.current) setHour(h);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [playing]);

  useEffect(() => {
    if (playing && hour >= HOURS[1]) setPlaying(false);
  }, [playing, hour]);

  const time = timestamp(day, hour);
  const sun = meta ? sunPosition(time, meta.centre[1], meta.centre[0]) : null;
  const ramp = RAMPS[colour];
  const has3d = webgl && !glError;

  return (
    <div className="page viewer3d">
      <header className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Kampala Heat Atlas · 3D model</span>
        <h1>Kampala in 3D</h1>
        <p className="lede">
          Buildings at real height on bare-earth terrain. Shadows follow the sun at 0.31° N; arrows show the daytime lake
          breeze from the south. Drag to pan, right-drag or two fingers to orbit, scroll or pinch to zoom.
        </p>
      </header>

      {districts.state === "error" && <p className="state">The 3D model could not be loaded ({districts.message}).</p>}

      <section className="card scene-card" aria-label="3D model">
        <div className="scene" role="img" aria-label={meta ? `3D model of ${meta.label}, coloured by ${ramp.name.toLowerCase()}, sun at ${clock(hour)} on ${day}` : "3D model"}>
          {!webgl || glError ? <NoWebGL detail={glError ?? undefined} />
            : meta && data.state === "ready" ? (
              <Scene meta={meta} data={data.data} colour={colour} time={time} wind={wind} shade={shade} viewKey={viewKey} places={inDistrict} onError={setGlError} />
            ) : data.state === "error" ? <p className="state scene-msg">This district could not be loaded ({data.message}).</p>
            : <p className="state scene-msg">Loading {meta?.label ?? "the model"}…</p>}
        </div>

        {has3d && !panel && (
          <button type="button" className="btn show-panel" onClick={() => setPanel(true)} aria-expanded={false} aria-controls="panel3d">Show controls</button>
        )}
        {has3d && panel && <div className="panel3d" id="panel3d">
          <button type="button" className="btn hide-panel" onClick={() => setPanel(false)} aria-expanded aria-controls="panel3d">Hide</button>
          <div className="ctl">
            <span className="eyebrow">District</span>
            <div className="chips">
              {Object.entries(list).map(([k, d]) => (
                <button key={k} type="button" className="chip" aria-pressed={k === name} onClick={() => setName(k)}>{d.label}</button>
              ))}
            </div>
          </div>
          <div className="ctl">
            <span className="eyebrow">Colour buildings by</span>
            <div className="chips">
              {(Object.keys(RAMPS) as ColourKey[]).map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={k === colour} onClick={() => setColour(k)}>{RAMPS[k].name}</button>
              ))}
            </div>
            <div className="ramp3d">
              <div className="bar" style={{ background: `linear-gradient(90deg, ${ramp.stops.join(", ")})` }} />
              <div className="ends"><span>{ramp.dom[0]}</span><span className="mid">{ramp.label}</span><span>{ramp.dom[1]}+</span></div>
              <p className="fine">{ramp.describe} Grey: not computed.</p>
            </div>
          </div>
          <div className="ctl">
            <span className="eyebrow">Sun</span>
            <div className="chips">
              {(Object.keys(DAYS) as DayKey[]).map((d) => (
                <button key={d} type="button" className="chip" aria-pressed={d === day} onClick={() => setDay(d)}>{d}</button>
              ))}
            </div>
            <div className="sunrow">
              <button type="button" className="iconbtn" onClick={() => {
                if (!playing && hour >= HOURS[1]) setHour(HOURS[0]);
                setPlaying(!playing);
              }} aria-label={playing ? "Pause the sun" : "Play the day"}>
                {playing ? <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>}
              </button>
              <input type="range" min={HOURS[0]} max={HOURS[1]} step={0.25} value={hour} aria-label="Time of day"
                aria-valuetext={`${clock(hour)} local`} onChange={(e) => { setPlaying(false); setHour(Number(e.target.value)); }} />
            </div>
            <div className="sunread">
              <b className="num">{clock(hour)}</b>
              <span>{sun && (sun.elevation > 0
                ? <>sun {sun.elevation.toFixed(0)}° high, in the {compass(sun.azimuth)}</>
                : <>sun below the horizon</>)}</span>
            </div>
          </div>
          <div className="ctl toggles">
            <label><input type="checkbox" checked={wind} onChange={(e) => setWind(e.target.checked)} /> Lake-breeze flow arrows</label>
            <label><input type="checkbox" checked={shade} onChange={(e) => setShade(e.target.checked)} /> Ground: daily shade hours, 10:00–16:00</label>
            {shade && (
              <div className="ramp3d">
                <div className="bar" style={{ background: `linear-gradient(90deg, ${SHADE_STOPS.join(", ")})` }} />
                <div className="ends"><span>0 h</span><span className="mid">shade on open ground</span><span>3+ h</span></div>
              </div>
            )}
          </div>
        </div>}

        {has3d && <button type="button" className="btn reset" onClick={() => setViewKey((k) => k + 1)}>Reset view</button>}
      </section>

      {meta && <Stats meta={meta} />}

      <p className="fine">
        Heights: Overture, else Open Buildings 2.5D footprint p90 (2023). Irradiance: 2 m ray-traced shadows, 12 days × daylight
        hours, ERA5-scaled. Wind: 2D potential flow (no turbulence). Terrain: FABDEM (CC BY-NC-SA). Shadows in the model are
        drawn by the graphics card for the chosen hour; the roof numbers come from the year-round ray tracing.
        {placesLoad.state === "ready" && placesLoad.data.source && <> Place names {placesLoad.data.source}.</>}
      </p>
    </div>
  );
}
