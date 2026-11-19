import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GlossaryList, Term } from "../components/Term";
import { Icon } from "../components/ui";
import { HeatStrip } from "../heat/HeatStrip";
import { useMode, type Mode } from "../mode";
import { AtlasMap } from "./AtlasMap";
import { LandcoverChart, LczChart, SolarChart, TrajectoryChart, TreesChart, WindRose } from "./charts";
import { atlasUrl, useAtlas } from "./data";
import { simpleAtlas } from "./simple";
import { SolarCalculator } from "./SolarCalculator";
import { hourLabel, num, pctChange, pctRange, range, signed, thousands, useStats, type Stats } from "./stats";
import type { Atlas } from "./types";
import "./atlas.css";

// Which map layer each module is about ("Show on map").
const MODULE_LAYER: Record<string, string> = {
  growth: "growth", heat: "thermal-2025", people: "informal-2025", trees: "trees", cube: "lst-2025", solar: "solar",
};

const Num = ({ children }: { children: ReactNode }) => <span className="num-hi">{children}</span>;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** [5.21, 5.87] -> "+5.2 to +5.9" (one value when both ends round the same) */
const span = ([a, b]: [number, number], d = 1) => (signed(a, d) === signed(b, d) ? signed(a, d) : `${signed(a, d)} to ${signed(b, d)}`);

type Sure = "solid" | "fair" | "early";
const SURE: Record<Sure, string> = { solid: "Solid", fair: "Fairly sure", early: "Early result" };

/** "How sure are we?" in one word and one line, instead of the research caveats (which stay under "How we know this"). */
function Confidence({ level, why }: { level: Sure; why: ReactNode }) {
  return (
    <p className={`confidence c-${level}`}>
      <span className="conf-badge">{SURE[level]}</span>
      <span><b>How sure are we?</b> {why}</span>
    </p>
  );
}

function Module(props: {
  id: string; n: string; eyebrow: string; simpleEyebrow: string; title: ReactNode; atlas: Atlas; mode: Mode; onShow: (layer: string) => void;
  /** Plain-language findings (simple mode). */
  simple: ReactNode;
  /** The research findings (detailed mode, and "How we know this" in simple mode). */
  detailed: ReactNode;
  figure: ReactNode;
  callout?: ReactNode;
  sure: { level: Sure; why: ReactNode };
  after?: ReactNode;
}) {
  const layer = props.atlas.layers.find((l) => l.id === MODULE_LAYER[props.id]);
  const simple = props.mode === "simple";
  return (
    <section className="card module" id={props.id} aria-labelledby={`${props.id}-title`}>
      <header className="module-head">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">{simple ? props.simpleEyebrow : `Module ${props.n} · ${props.eyebrow}`}</span>
          <h2 id={`${props.id}-title`}>{props.title}</h2>
        </div>
        {layer && (
          <button type="button" className="btn" onClick={() => props.onShow(layer.id)}>
            <Icon.map /> Show on map
          </button>
        )}
      </header>
      <div className="cols">
        <ul className={`find${simple ? " plain" : ""}`}>{simple ? props.simple : props.detailed}</ul>
        {props.figure}
      </div>
      {simple ? (
        <>
          <Confidence level={props.sure.level} why={props.sure.why} />
          <details className="how">
            <summary>How we know this</summary>
            <ul className="find">{props.detailed}</ul>
            {props.callout && <p className="callout">{props.callout}</p>}
          </details>
        </>
      ) : (
        props.callout && <p className="callout">{props.callout}</p>
      )}
      {props.after}
    </section>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const opts: [Mode, string][] = [["simple", "Simple"], ["detailed", "Detailed"]];
  return (
    <div className="seg" role="group" aria-label="How to explain the findings">
      {opts.map(([m, label]) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => onChange(m)}>{label}</button>
      ))}
    </div>
  );
}

function Content({ atlas: rawAtlas, stats, mapRef }: { atlas: Atlas; stats: Stats; mapRef: React.RefObject<HTMLElement | null> }) {
  const [mode, setMode] = useMode();
  const simple = mode === "simple";
  const atlas = useMemo(() => (simple ? simpleAtlas(rawAtlas) : rawAtlas), [rawAtlas, simple]);
  const n = stats.numbers;
  const ch = stats.charts;
  const [y0, y1, y2] = stats.years;
  const table = (name: string) => atlasUrl(stats.tables[name] ?? `tables/${name}`);
  const [layerId, setLayerId] = useState(atlas.layers[0]?.id ?? "");
  const show = (id: string) => {
    setLayerId(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const [b0, , b2] = n.built_km2;
  const hottestValues = ch.lcz.zones.filter((z) => n.hottest_lcz.some((h) => z.name.endsWith(h))).map((z) => z.values[1]);
  const hotRange = range([Math.min(...hottestValues), Math.max(...hottestValues)], 0);
  const top10Beats = n.solar_top10_gwh > n.national_sales_gwh;
  const growthPct = pctChange(b0, b2).replace("+", "");

  const facts: { tag: string; value: ReactNode; tone?: "hot" | "cool"; text: ReactNode; plain: ReactNode; module: string }[] = [
    { tag: "Growth", value: `${pctChange(b0, b2)}%`, text: <>built-up land, {num(b0)} → {num(b2)} km² ({y0}–{y2})</>, plain: <>more built-up land than in {y0}</>, module: "growth" },
    { tag: "Heat", value: `${num(n.hot_km2[2])} km²`, tone: "hot", text: <>in the hottest class in {y2} ({num(n.hot_km2[0])} km² in {y0})</>, plain: <>of land in the hottest group in {y2}</>, module: "heat" },
    { tag: simple ? "Housing" : "Form", value: `${signed(n.informal_anom)} °C`, tone: "hot", text: <>packed low-rise blocks vs the city land mean (other dense {signed(n.formal_dense_anom)} °C)</>, plain: <>hotter ground in small, tightly packed housing than the city average</>, module: "people" },
    { tag: "Trees", value: `−${num(n.planting_cooling, 1)} °C`, tone: "cool", text: <>average cooling from {num(n.planting_new_canopy_km2)} km² of new canopy, for about {thousands(n.planting_people)} people</>, plain: <>cooler, if half the open ground in hot, crowded areas were planted</>, module: "trees" },
    { tag: "Solar", value: `${num(n.solar_gwh / 1000)} TWh`, text: <>a year from {num(n.roofs / 1e6, 1)} M roofs ({num(n.solar_gwp)} GWp technical potential)</>, plain: <>of electricity a year possible from rooftops</>, module: "solar" },
  ];

  return (
    <>
      <header className="atlas-head">
        <div className="head-row">
          <span className="eyebrow">PhD research · first full run · dry seasons {y0}, {y1}, {y2}</span>
          <ModeSwitch mode={mode} onChange={setMode} />
        </div>
        <h1>Kampala Heat Atlas</h1>
        {simple ? (
          <p className="lede">
            Kampala has grown fast. This atlas shows where the city is hottest, who lives in the heat, and what trees and rooftops
            could do about it, from satellite images and weather records. Search for your area on the map to see what it is like there.
          </p>
        ) : (
          <>
            <p className="lede">
              How Kampala grew, where it is hottest, who lives in the heat, and what trees and rooftops could do about it. Six
              analyses on one 30 m grid covering the city and its growth frontier.
            </p>
            <span className="coords">0.10–0.55° N · 32.35–32.85° E · UTM 36N · Landsat 8/9, Sentinel-2, Open Buildings 2.5D, Overture, ERA5-Land, FABDEM</span>
          </>
        )}
        {simple && (
          <aside className="reading">
            <Icon.info size={16} />
            <p>
              <b>Reading the heat maps.</b> They show how hot the ground, roofs and roads get on dry-season days, compared with the
              city average. That is <Term id="lst">surface temperature</Term>, from satellites: surfaces in the sun get much hotter
              than the air, so read the maps for which places run hotter than others, not for the temperature you feel.
              Underlined words have a short explanation; tap them, or see the <a href="#/atlas/glossary">glossary</a>.
            </p>
          </aside>
        )}
      </header>

      <HeatStrip />

      <section className="card facts" aria-label="Headline findings">
        {facts.map((f) => (
          <a className="fact" key={f.tag} href={`#/atlas/${f.module}`}>
            <span className="eyebrow">{f.tag}</span>
            <b className={f.tone ?? ""}>{f.value}</b>
            <span>{simple ? f.plain : f.text}</span>
          </a>
        ))}
      </section>

      <AtlasMap ref={mapRef} atlas={atlas} layerId={layerId} onLayer={setLayerId} />

      <Module id="growth" n="1" eyebrow="Urban growth" simpleEyebrow="How the city grew" title={`Built-up land grew ${growthPct} % in ${y2 - y0} years`} atlas={atlas} mode={mode} onShow={show}
        simple={<>
          <li>The area covered by buildings and roads grew from <Num>{num(b0)}</Num> to <Num>{num(b2)}</Num> km² between {y0} and {y2}: about {growthPct} % more. Most new building is east along the Jinja Road and north into Wakiso.</li>
          <li>In the older parts of the city, gaps filled in: about {num(n.sparse_to_dense_km2)} km² went from scattered houses to packed buildings.</li>
        </>}
        detailed={<>
          <li>Built-up land rose from <Num>{num(b0)}</Num> to <Num>{num(b2)}</Num> km² between {y0} and {y2}. Growth runs east along the Jinja Road and north into Wakiso.</li>
          <li>The core densified: sparse fabric turned dense across about {num(n.sparse_to_dense_km2)} km².</li>
          <li>Classifier <Term id="agreement">agreement with its training labels</Term> is {pctRange(n.label_agreement)} % (<Term id="kappa">kappa</Term> {range(n.kappa, 2)}) on held-out samples.</li>
        </>}
        figure={<LandcoverChart c={ch.landcover} href={table(ch.landcover.source)} />}
        callout={<><b>Before citing.</b> Agreement with training labels is not map accuracy. {num(n.validation_points)} <Term id="validation">validation points</Term> still need to be labelled by eye. Tree-cover gains probably include seasonal cropland confusion.</>}
        sure={{ level: "fair", why: <>The growth map matches the examples it learned from well, but has not yet been checked spot by spot by eye. Some apparent new trees may be crops.</> }}
      />

      <Module id="heat" n="2" eyebrow="Thermal classification" simpleEyebrow="Where it is hottest" title={`Compact neighbourhoods run ${hotRange.includes("–") ? hotRange : `about ${hotRange}`} °C above the city`} atlas={atlas} mode={mode} onShow={show}
        simple={<>
          <li>About <Num>{num(n.hot_km2[2])}</Num> km² is in the hottest group in {y2}.{n.hot_all_epochs_km2 !== undefined && <> About {num(n.hot_all_epochs_km2)} km² has been among the hottest every time we looked.</>}</li>
          <li>The most packed neighbourhoods run hottest: their ground and roofs are about {hotRange} °C above the city average. Places with dense trees are about {num(Math.abs(n.dense_trees_anom))} °C below it.</li>
          <li>{cap(n.fastest_warming_lcz)} areas{n.fastest_warming_lcz === "large low-rise" ? ", like warehouses and sheds," : ""} have warmed most since {y0}.</li>
        </>}
        detailed={<>
          <li>
            The hottest <Term id="thermal">class</Term> covers <Num>{num(n.hot_km2[2])}</Num> km² in {y2}.
            {n.hot_all_epochs_km2 !== undefined && <> About {num(n.hot_all_epochs_km2)} km² are hot in all three <Term id="epoch">epochs</Term>: these are the persistent hotspots.</>}
          </li>
          <li>
            {cap(n.hottest_lcz.join(" and "))} zones are the hottest <Term id="lcz">Local Climate Zones</Term>.{" "}
            {cap(n.fastest_warming_lcz)} zones{n.fastest_warming_lcz === "large low-rise" ? ", such as sheds and warehouses," : ""} warm fastest
            ({signed(n.fastest_warming_lcz_change)} °C since {y0}). Dense tree cover sits about {num(Math.abs(n.dense_trees_anom))} °C below the <Term id="anomaly">mean</Term>.
          </li>
          <li><Term id="lst">Surface temperature</Term> covers 100 % of the area, against {pctRange(n.c2st_coverage)} % for the <Term id="c2st">standard product</Term>, and agrees with it at <Term id="r">r</Term> = {range(n.lst_r, 2)}.</li>
        </>}
        figure={<LczChart c={ch.lcz} href={table(ch.lcz.source)} />}
        sure={{ level: "solid", why: <>Measured by satellite in three dry seasons, and checked against the satellite programme's own product, which it matches closely.</> }}
      />

      <Module id="people" n="3" eyebrow="Settlements" simpleEyebrow="Crowded housing" title="Blocks that packed in fastest warmed most" atlas={atlas} mode={mode} onShow={show}
        simple={<>
          <li>Small, tightly packed homes are the hottest kind of neighbourhood: their ground and roofs run <Num>{signed(n.informal_anom)} °C</Num> above the city average.</li>
          <li>Places that filled up with packed housing since {y0} heated up the most ({signed(n.became_informal_change)} °C compared with the city), more than places that were already crowded ({signed(n.always_formal_change)} °C).</li>
          <li>So the extra heat comes from crowding in, not from how people came to live there.</li>
        </>}
        detailed={<>
          <li>Small, tightly packed low-rise blocks sit <Num>{signed(n.informal_anom)} °C</Num> above the city land mean, about {num(n.informal_anom - n.formal_dense_anom)} °C hotter than other dense fabric ({signed(n.formal_dense_anom)} °C).</li>
          <li>Blocks that densified into packed low-rise fabric between {y0} and {y2} warmed <Num>{signed(n.became_informal_change)} °C</Num> relative to the city. Blocks already dense in {y0} warmed {signed(n.always_formal_change)} °C.</li>
          <li>Detected well: Kawempe Mbogo, Kazo Angola, Kifumbira, Kalerwe.</li>
        </>}
        figure={<TrajectoryChart c={ch.trajectories} href={table(ch.trajectories.source)} />}
        callout={<>
          <b>Checked against the literature.</b> Against the 58 informal settlements mapped by the slum dwellers' federation
          (SDI/NSDFU/ACTogether, 2014), georeferenced from their map book: established informal settlements are as hot as other
          dense fabric ({span(n.sdi_anom)} °C vs {span(n.sdi_dense_anom)} °C) and warmed less since {y0} ({span(n.sdi_change, 2)} vs{" "}
          {span(n.sdi_dense_change, 2)} °C; ranges over ±250 m georeferencing shifts). The fast warming belongs to blocks that densified, not to informality as
          such. The <Term id="morphology">morphology</Term> layer covers {pctRange(n.sdi_detected_share)} % of the federation's settlements.
        </>}
        sure={{ level: "fair", why: <>Checked against the slum dwellers' federation map of 58 settlements, which agrees on the heat. But the housing map finds only about a quarter of those settlements, so it misses some.</> }}
      />

      <Module id="trees" n="4" eyebrow="Where to plant" simpleEyebrow="Where to plant trees" title={`${num(n.very_high_km2)} km² where heat, people and bare ground meet`} atlas={atlas} mode={mode} onShow={show}
        simple={<>
          <li>{num(n.very_high_km2)} km² should be first in line for new trees: hot, crowded, with open ground to plant on. About {thousands(n.very_high_people)} people live there, and today it has almost no trees.</li>
          <li>Places with more trees run cooler: every extra tenth of the ground under trees goes with surfaces about <Num>{num(n.cooling_per_10pct_canopy, 1)} °C</Num> cooler.</li>
          <li>Planting half the open ground in the priority areas would add {num(n.planting_new_canopy_km2)} km² of trees and cool them by about {num(n.planting_cooling, 1)} °C, for about {thousands(n.planting_people)} people.</li>
        </>}
        detailed={<>
          <li>Each extra 10 % of <Term id="canopy">canopy</Term> goes with <Num>{num(n.cooling_per_10pct_canopy, 2)} °C</Num> cooler surfaces in built-up cells.</li>
          <li>The very-high <Term id="priority">priority class</Term> holds about {thousands(n.very_high_people)} residents and almost no trees today ({num(n.very_high_tree_pct, 1)} % canopy).</li>
          <li>Planting half the open land in high and very-high cells adds {num(n.planting_new_canopy_km2)} km² of canopy and cools those cells by about {num(n.planting_cooling, 1)} °C.</li>
        </>}
        figure={<TreesChart c={ch.trees} href={table(ch.trees.source)} />}
        callout={<><b>Before citing.</b> The cooling model explains about {num(n.cooling_model_r2 * 100)} % of the variation in surface temperature (<Term id="r2">R²</Term> {num(n.cooling_model_r2, 2)}). Surface cooling is larger than air-temperature cooling.</>}
        sure={{ level: "early", why: <>Where to plant is solid, but the cooling estimate is rough: trees explain only about a third of the differences in temperature, and the air cools less than the ground.</> }}
      />

      <Module id="cube" n="0" eyebrow="The cube" simpleEyebrow="Sun and breeze" title="Sun overhead, breeze from the lake" atlas={atlas} mode={mode} onShow={show}
        simple={<>
          <li>Kampala is almost on the equator, so the midday sun is high all year. Solar panels work best lying nearly flat.</li>
          <li>East- and west-facing walls get about {num(n.east_west_wall_ratio, 0)} times as much direct sun as north- and south-facing ones. Buildings stay cooler with their long sides facing north and south.</li>
          <li>
            {n.lake_breeze_peak_hour !== undefined
              ? <>In the daytime a cooling <Term id="breeze">breeze</Term> blows in from Lake Victoria to the south, strongest around {hourLabel(n.lake_breeze_peak_hour)}.</>
              : <>In the daytime a cooling <Term id="breeze">breeze</Term> blows in from Lake Victoria to the south.</>}{" "}
            Windows and gaps on the south side let it through.
          </li>
        </>}
        detailed={<>
          <li>At {num(n.centre_lat, 1)}° N the noon sun never drops below {num(n.noon_sun_min_deg)}°. Flat or 5–10° panels are best; tilting them changes <Term id="yield">yield</Term> by at most {num(n.low_tilt_max_loss_pct, 1)} %.</li>
          <li>East and west walls take about {num(n.east_west_wall_ratio, 1)} times the direct sun of north and south walls. Long axes should run east–west.</li>
          <li>
            {n.lake_breeze_peak_hour !== undefined && n.lake_breeze_peak_share !== undefined
              ? <>The Lake Victoria breeze blows from the south and south-east, most of all around {hourLabel(n.lake_breeze_peak_hour)} ({num(n.lake_breeze_peak_share * 100)} % of those hours).</>
              : <>In the daytime the Lake Victoria breeze builds from the south.</>}{" "}
            Long south facades catch it; north–south gaps let it through. Wind from <Term id="era5">ERA5-Land</Term>, 2015–2024.
          </li>
        </>}
        figure={ch.wind ? (
          <WindRose c={ch.wind} href={table(ch.wind.source)} start={n.lake_breeze_peak_hour ?? 15} />
        ) : atlas.anims?.wind ? (
          <figure className="plate">
            <img src={atlasUrl(atlas.anims.wind)} alt="Animated wind rose cycling through 24 hours" loading="lazy" />
            <figcaption>Wind direction through the day, ERA5-Land 2015–2024.</figcaption>
          </figure>
        ) : null}
        sure={{ level: "solid", why: <>The sun's path is exact; the wind comes from ten years of hourly weather records.</> }}
        after={
          <a className="to3d" href="#/3d">
            <span className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">3D model</span>
              <b>See the sun, shade and breeze in 3D</b>
              <span className="muted">Central Kampala, an informal settlement and the growth frontier: terrain and building heights, shadows for any hour, and the lake breeze.</span>
            </span>
            <Icon.arrowRight size={20} />
          </a>
        }
      />

      <Module id="solar" n="5" eyebrow="Rooftop solar" simpleEyebrow="Rooftop solar" title="Roof space is not the constraint" atlas={atlas} mode={mode} onShow={show}
        simple={<>
          <li>Panels on Kampala's roofs could make about <Num>{num(n.solar_gwh / 1000)} TWh</Num> of electricity a year: about {num(n.solar_gwh / n.national_sales_gwh)} times what Uganda's electricity distributor sold in 2024.</li>
          <li>The biggest tenth of the roofs alone {top10Beats ? "could make more than" : "could make nearly"} all the electricity sold in the country that year.</li>
          <li>So space on roofs is not the problem. The hard parts are using power in the daytime, the grid, storage, and paying for it.</li>
        </>}
        detailed={<>
          <li>{num(n.roofs / 1e6, 1)} million roofs could host about <Num>{num(n.solar_gwp)} <Term id="gwp">GWp</Term></Num> and generate <Num>{num(n.solar_gwh / 1000)} <Term id="twh">TWh</Term></Num> a year, at {num(n.solar_yield)} <Term id="yield">kWh per kWp</Term>.</li>
          <li>The largest tenth of roofs alone ({num(n.solar_top10_gwh / 1000, 1)} TWh) {top10Beats ? "exceeds" : "falls short of"} Uganda's 2024 distribution sales of {num(n.national_sales_gwh / 1000, 1)} TWh (Umeme).</li>
          <li>The real limits are daytime demand, grid absorption, storage and finance. That is the question for the solar chapter.</li>
        </>}
        figure={<SolarChart c={ch.solar} href={table(ch.solar.source)} />}
        sure={{ level: "fair", why: <>This is a technical upper limit: it assumes panels on every usable roof, with shade from neighbouring buildings taken into account.</> }}
        after={<SolarCalculator yieldKwhPerKwp={n.solar_yield} />}
      />

      <section className="card module" id="glossary" aria-labelledby="glossary-title">
        <header className="module-head">
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Glossary</span>
            <h2 id="glossary-title">What the words mean</h2>
          </div>
        </header>
        <GlossaryList />
      </section>

      <footer className="fine stack" style={{ gap: 6 }}>
        <span>Sources: Landsat 8/9 C2 (USGS), Sentinel-2 + Cloud Score+ (ESA, Google), Dynamic World, ESA WorldCover, Open Buildings 2.5D Temporal, Overture Maps 2026-10-21.0, FABDEM V1-2, ERA5-Land (ECMWF), GHS-POP R2023A (JRC), global LCZ map (Demuzere et al. 2022), Umeme Annual Report 2024. Street map © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap.</span>
        <span>First-pass results. Several layers carry open validation items, listed with each module. Numbers and charts are computed from the result tables (updated {stats.generated}); each chart links to its table.</span>
      </footer>
    </>
  );
}

/** The 2D atlas. `section` scrolls to a module (#/atlas/heat), so links to the old page's #heat still land. */
export function AtlasPage({ section }: { section?: string }) {
  const atlas = useAtlas();
  const stats = useStats();
  const mapRef = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = "Kampala Heat Atlas";
  }, []);
  useEffect(() => {
    if (atlas.state !== "ready" || stats.state !== "ready" || !section) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(section)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [atlas.state, stats.state, section]);

  return (
    <div className="page atlas-page">
      {(atlas.state === "loading" || stats.state === "loading") && <p className="state">Loading the atlas…</p>}
      {atlas.state === "error" && <p className="state">The atlas data could not be loaded ({atlas.message}).</p>}
      {stats.state === "error" && <p className="state">The atlas numbers could not be loaded ({stats.message}).</p>}
      {atlas.state === "ready" && stats.state === "ready" && <Content atlas={atlas.data} stats={stats.data} mapRef={mapRef} />}
    </div>
  );
}
