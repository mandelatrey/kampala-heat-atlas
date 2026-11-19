import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { atlasUrl } from "../data";
import { gridGeo } from "../geo";
import { usePlaces } from "../places";
import { hexToRgb } from "../raster";
import { num, type Stats } from "../stats";
import type { Atlas } from "../types";
import { DIRECTIONS, growthByDirection, growthPicture, topDirections, type Direction } from "./logic";
import { useLayers, useNearScreen, type Layers } from "./useLayers";

const KAMPALA = { lat: 0.3136, lon: 32.5811 };     // fallback centre when the place list has no city
const STEP_MS = 1400;

/** "Watch the city grow" (the growth layer, step by step, with the built-up area) and "Which way did it grow?". */
export function GrowthExplorer({ atlas, stats }: { atlas: Atlas; stats: Stats }) {
  const box = useRef<HTMLDivElement>(null);
  const layers = useLayers(atlas, ["growth"], useNearScreen(box));
  return (
    <div className="explore" ref={box}>
      {layers.state === "loading" && <p className="muted">Loading the growth map…</p>}
      {layers.state === "error" && <p className="muted">The growth map could not be loaded ({layers.message}).</p>}
      {layers.state === "ready" && (
        <div className="explore-grid">
          <Player atlas={atlas} stats={stats} growth={layers.data.growth!} />
          <Guess atlas={atlas} growth={layers.data.growth!} />
        </div>
      )}
    </div>
  );
}

type Growth = Layers[string];

function Player({ atlas, stats, growth }: { atlas: Atlas; stats: Stats; growth: Growth }) {
  const years = stats.years;
  const built = stats.numbers.built_km2;
  const [step, setStep] = useState(2);
  const [playing, setPlaying] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { layer, raster } = growth;
  const classes = layer.style.kind === "classes" ? layer.style.classes : [];
  const colors = useMemo(() => [1, 2, 3].map((v) => hexToRgb(classes.find((c) => c.value === v)?.color ?? "#888888")), [classes]);
  const pictures = useMemo(() => [0, 1, 2].map((s) => new ImageData(growthPicture(raster, layer.values!, s, colors), raster.width, raster.height)), [raster, layer.values, colors]);

  useEffect(() => {
    canvas.current?.getContext("2d")?.putImageData(pictures[step]!, 0, 0);
  }, [step, pictures]);
  useEffect(() => {
    if (!playing) return;
    if (step >= 2) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, step]);

  const play = () => {
    if (playing) return setPlaying(false);
    setStep(0);
    setPlaying(true);
  };
  const added = step > 0 ? built[step]! - built[0]! : 0;
  return (
    <section className="explore-card" aria-labelledby="grow-title">
      <h3 id="grow-title">Watch the city grow</h3>
      <div className="grow-map" style={{ backgroundImage: `url(${atlasUrl(atlas.base)})`, aspectRatio: `${raster.width} / ${raster.height}` }}>
        <canvas ref={canvas} width={raster.width} height={raster.height} role="img"
          aria-label={`Map of built-up land in ${years[step]}: ${num(built[step]!)} square kilometres`} />
      </div>
      <div className="grow-controls">
        <button type="button" className="iconbtn" onClick={play} aria-label={playing ? "Pause" : `Play ${years.join(", ")}`}>{playing ? <Icon.pause /> : <Icon.play />}</button>
        <div className="seg" role="group" aria-label="Year">
          {years.map((y, i) => (
            <button key={y} type="button" aria-pressed={step === i} onClick={() => { setPlaying(false); setStep(i); }}>{y}</button>
          ))}
        </div>
      </div>
      <p className="grow-count" aria-live="polite">
        <b>{num(built[step]!)} km²</b> built up in {years[step]}
        {step > 0 && <span className="muted"> · {num(added)} km² more than in {years[0]}</span>}
      </p>
      <div className="legend-classes">
        {classes.map((c) => <span key={c.value}><i style={{ background: c.color }} />{c.name}</span>)}
      </div>
    </section>
  );
}

function Guess({ atlas, growth }: { atlas: Atlas; growth: Growth }) {
  const placesLoad = usePlaces();
  const [guess, setGuess] = useState<Direction | null>(null);
  const { raster, layer } = growth;
  const geo = useMemo(() => gridGeo(atlas.grid, atlas.size[0], atlas.size[1]), [atlas.grid, atlas.size]);
  const city = placesLoad.state === "ready" ? placesLoad.data.places.find((p) => p.kind === "city" && p.name === "Kampala") : undefined;
  const lat = city?.lat ?? KAMPALA.lat, lon = city?.lon ?? KAMPALA.lon;
  const km2 = useMemo(() => growthByDirection(raster, layer.values!, geo.cellAt(lat, lon), atlas.grid.pixel, [2, 3]),
    [raster, layer.values, geo, lat, lon, atlas.grid.pixel]);
  const [first, second] = topDirections(km2);
  const max = Math.max(...km2);
  const total = km2.reduce((a, b) => a + b, 0);
  // compass layout: 3 x 3, the centre is the city
  const grid: (Direction | null)[] = ["north-west", "north", "north-east", "west", null, "east", "south-west", "south", "south-east"];
  return (
    <section className="explore-card" aria-labelledby="guess-title">
      <h3 id="guess-title">Which way did Kampala grow?</h3>
      <p className="muted">Between {atlas.years[0]} and {atlas.years[2]}, which way from the city centre did the most new building go? {guess ? "" : "Make a guess."}</p>
      <div className="compass" role="group" aria-label="Directions">
        {grid.map((d, i) => d === null
          ? <span key={i} className="compass-centre">Kampala</span>
          : (
            <button key={d} type="button" className={`compass-dir${guess ? (d === first ? " best" : d === second ? " second" : "") : ""}`}
              aria-pressed={guess === d} onClick={() => setGuess(d)}
              style={guess ? { ["--share" as string]: `${(km2[DIRECTIONS.indexOf(d)]! / max) * 100}%` } : undefined}>
              <span>{d.replace("-", " ")}</span>
              {guess && <small>{num(km2[DIRECTIONS.indexOf(d)]!)} km²</small>}
            </button>
          ))}
      </div>
      {guess && (
        <p aria-live="polite">
          {guess === first ? <b>Right. </b> : guess === second ? <b>Close. </b> : <b>Not quite. </b>}
          Most new building went <b>{first}</b> ({num(km2[DIRECTIONS.indexOf(first)]!)} km², {Math.round((100 * km2[DIRECTIONS.indexOf(first)]!) / total)}% of all new
          building), then {second}. {km2[DIRECTIONS.indexOf("south-east")]! < total / 16 && "Lake Victoria leaves little room to the south-east. "}
          <button type="button" className="linkbtn" onClick={() => setGuess(null)}>Guess again</button>
        </p>
      )}
      <p className="fine">New building is land mapped as built up in {atlas.years[1]} or {atlas.years[2]} that was not in {atlas.years[0]}, counted by direction from the city centre across the whole atlas area.</p>
    </section>
  );
}
