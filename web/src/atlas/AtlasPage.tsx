import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/ui";
import { AtlasMap } from "./AtlasMap";
import { LandcoverChart, LczChart, SolarChart, TrajectoryChart, TreesChart, WindRose } from "./charts";
import { atlasUrl, useAtlas } from "./data";
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

function Module(props: {
  id: string; n: string; eyebrow: string; title: ReactNode; atlas: Atlas; onShow: (layer: string) => void; children: ReactNode;
}) {
  const layer = props.atlas.layers.find((l) => l.id === MODULE_LAYER[props.id]);
  return (
    <section className="card module" id={props.id} aria-labelledby={`${props.id}-title`}>
      <header className="module-head">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Module {props.n} · {props.eyebrow}</span>
          <h2 id={`${props.id}-title`}>{props.title}</h2>
        </div>
        {layer && (
          <button type="button" className="btn" onClick={() => props.onShow(layer.id)}>
            <Icon.map /> Show on map
          </button>
        )}
      </header>
      {props.children}
    </section>
  );
}

function Content({ atlas, stats, mapRef }: { atlas: Atlas; stats: Stats; mapRef: React.RefObject<HTMLElement | null> }) {
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

  const facts: { tag: string; value: ReactNode; tone?: "hot" | "cool"; text: ReactNode; module: string }[] = [
    { tag: "Growth", value: `${pctChange(b0, b2)}%`, text: <>built-up land, {num(b0)} → {num(b2)} km² ({y0}–{y2})</>, module: "growth" },
    { tag: "Heat", value: `${num(n.hot_km2[2])} km²`, tone: "hot", text: <>in the hottest class in {y2} ({num(n.hot_km2[0])} km² in {y0})</>, module: "heat" },
    { tag: "Form", value: `${signed(n.informal_anom)} °C`, tone: "hot", text: <>packed low-rise blocks vs the city land mean (other dense {signed(n.formal_dense_anom)} °C)</>, module: "people" },
    { tag: "Trees", value: `−${num(n.planting_cooling, 1)} °C`, tone: "cool", text: <>average cooling from {num(n.planting_new_canopy_km2)} km² of new canopy, for about {thousands(n.planting_people)} people</>, module: "trees" },
    { tag: "Solar", value: `${num(n.solar_gwh / 1000)} TWh`, text: <>a year from {num(n.roofs / 1e6, 1)} M roofs ({num(n.solar_gwp)} GWp technical potential)</>, module: "solar" },
  ];

  return (
    <>
      <header className="atlas-head">
        <span className="eyebrow">PhD research · first full run · dry seasons {y0}, {y1}, {y2}</span>
        <h1>Kampala Heat Atlas</h1>
        <p className="lede">
          How Kampala grew, where it is hottest, who lives in the heat, and what trees and rooftops could do about it. Six
          analyses on one 30 m grid covering the city and its growth frontier.
        </p>
        <span className="coords">0.10–0.55° N · 32.35–32.85° E · UTM 36N · Landsat 8/9, Sentinel-2, Open Buildings 2.5D, Overture, ERA5-Land, FABDEM</span>
      </header>

      <section className="card facts" aria-label="Headline findings">
        {facts.map((f) => (
          <a className="fact" key={f.tag} href={`#/atlas/${f.module}`}>
            <span className="eyebrow">{f.tag}</span>
            <b className={f.tone ?? ""}>{f.value}</b>
            <span>{f.text}</span>
          </a>
        ))}
      </section>

      <AtlasMap ref={mapRef} atlas={atlas} layerId={layerId} onLayer={setLayerId} />

      <Module id="growth" n="1" eyebrow="Urban growth" title={`Built-up land grew ${pctChange(b0, b2).replace("+", "")} % in ${y2 - y0} years`} atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>Built-up land rose from <Num>{num(b0)}</Num> to <Num>{num(b2)}</Num> km² between {y0} and {y2}. Growth runs east along the Jinja Road and north into Wakiso.</li>
            <li>The core densified: sparse fabric turned dense across about {num(n.sparse_to_dense_km2)} km².</li>
            <li>Classifier agreement with its training labels is {pctRange(n.label_agreement)} % (kappa {range(n.kappa, 2)}) on held-out samples.</li>
          </ul>
          <LandcoverChart c={ch.landcover} href={table(ch.landcover.source)} />
        </div>
        <p className="callout"><b>Before citing.</b> Agreement with training labels is not map accuracy. {num(n.validation_points)} validation points still need to be labelled by eye. Tree-cover gains probably include seasonal cropland confusion.</p>
      </Module>

      <Module id="heat" n="2" eyebrow="Thermal classification" title={`Compact neighbourhoods run ${hotRange.includes("–") ? hotRange : `about ${hotRange}`} °C above the city`} atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>
              The hottest class covers <Num>{num(n.hot_km2[2])}</Num> km² in {y2}.
              {n.hot_all_epochs_km2 !== undefined && <> About {num(n.hot_all_epochs_km2)} km² are hot in all three epochs: these are the persistent hotspots.</>}
            </li>
            <li>
              {cap(n.hottest_lcz.join(" and "))} zones are the hottest Local Climate Zones.{" "}
              {cap(n.fastest_warming_lcz)} zones{n.fastest_warming_lcz === "large low-rise" ? ", such as sheds and warehouses," : ""} warm fastest
              ({signed(n.fastest_warming_lcz_change)} °C since {y0}). Dense tree cover sits about {num(Math.abs(n.dense_trees_anom))} °C below the mean.
            </li>
            <li>Surface temperature covers 100 % of the area, against {pctRange(n.c2st_coverage)} % for the standard product, and agrees with it at r = {range(n.lst_r, 2)}.</li>
          </ul>
          <LczChart c={ch.lcz} href={table(ch.lcz.source)} />
        </div>
      </Module>

      <Module id="people" n="3" eyebrow="Settlements" title="Blocks that packed in fastest warmed most" atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>Small, tightly packed low-rise blocks sit <Num>{signed(n.informal_anom)} °C</Num> above the city land mean, about {num(n.informal_anom - n.formal_dense_anom)} °C hotter than other dense fabric ({signed(n.formal_dense_anom)} °C).</li>
            <li>Blocks that densified into packed low-rise fabric between {y0} and {y2} warmed <Num>{signed(n.became_informal_change)} °C</Num> relative to the city. Blocks already dense in {y0} warmed {signed(n.always_formal_change)} °C.</li>
            <li>Detected well: Kawempe Mbogo, Kazo Angola, Kifumbira, Kalerwe.</li>
          </ul>
          <TrajectoryChart c={ch.trajectories} href={table(ch.trajectories.source)} />
        </div>
        <p className="callout">
          <b>Checked against the literature.</b> Against the 58 informal settlements mapped by the slum dwellers' federation
          (SDI/NSDFU/ACTogether, 2014), georeferenced from their map book: established informal settlements are as hot as other
          dense fabric ({span(n.sdi_anom)} °C vs {span(n.sdi_dense_anom)} °C) and warmed less since {y0} ({span(n.sdi_change, 2)} vs{" "}
          {span(n.sdi_dense_change, 2)} °C; ranges over ±250 m georeferencing shifts). The fast warming belongs to blocks that densified, not to informality as
          such. The morphology layer covers {pctRange(n.sdi_detected_share)} % of the federation's settlements.
        </p>
      </Module>

      <Module id="trees" n="4" eyebrow="Where to plant" title={`${num(n.very_high_km2)} km² where heat, people and bare ground meet`} atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>Each extra 10 % of canopy goes with <Num>{num(n.cooling_per_10pct_canopy, 2)} °C</Num> cooler surfaces in built-up cells.</li>
            <li>The very-high priority class holds about {thousands(n.very_high_people)} residents and almost no trees today ({num(n.very_high_tree_pct, 1)} % canopy).</li>
            <li>Planting half the open land in high and very-high cells adds {num(n.planting_new_canopy_km2)} km² of canopy and cools those cells by about {num(n.planting_cooling, 1)} °C.</li>
          </ul>
          <TreesChart c={ch.trees} href={table(ch.trees.source)} />
        </div>
        <p className="callout"><b>Before citing.</b> The cooling model explains about {num(n.cooling_model_r2 * 100)} % of the variation in surface temperature (R² {num(n.cooling_model_r2, 2)}). Surface cooling is larger than air-temperature cooling.</p>
      </Module>

      <Module id="cube" n="0" eyebrow="The cube" title="Sun overhead, breeze from the lake" atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>At {num(n.centre_lat, 1)}° N the noon sun never drops below {num(n.noon_sun_min_deg)}°. Flat or 5–10° panels are best; tilting them changes yield by at most {num(n.low_tilt_max_loss_pct, 1)} %.</li>
            <li>East and west walls take about {num(n.east_west_wall_ratio, 1)} times the direct sun of north and south walls. Long axes should run east–west.</li>
            <li>
              {n.lake_breeze_peak_hour !== undefined && n.lake_breeze_peak_share !== undefined
                ? <>The Lake Victoria breeze blows from the south and south-east, most of all around {hourLabel(n.lake_breeze_peak_hour)} ({num(n.lake_breeze_peak_share * 100)} % of those hours).</>
                : <>In the daytime the Lake Victoria breeze builds from the south.</>}{" "}
              Long south facades catch it; north–south gaps let it through.
            </li>
          </ul>
          {ch.wind ? (
            <WindRose c={ch.wind} href={table(ch.wind.source)} start={n.lake_breeze_peak_hour ?? 15} />
          ) : atlas.anims?.wind ? (
            <figure className="plate">
              <img src={atlasUrl(atlas.anims.wind)} alt="Animated wind rose cycling through 24 hours" loading="lazy" />
              <figcaption>Wind direction through the day, ERA5-Land 2015–2024.</figcaption>
            </figure>
          ) : null}
        </div>
        <a className="to3d" href="#/3d">
          <span className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">3D model</span>
            <b>See the sun, shade and breeze in 3D</b>
            <span className="muted">Central Kampala, an informal settlement and the growth frontier: terrain and building heights, shadows for any hour, and the lake breeze.</span>
          </span>
          <Icon.arrowRight size={20} />
        </a>
      </Module>

      <Module id="solar" n="5" eyebrow="Rooftop solar" title="Roof space is not the constraint" atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>{num(n.roofs / 1e6, 1)} million roofs could host about <Num>{num(n.solar_gwp)} GWp</Num> and generate <Num>{num(n.solar_gwh / 1000)} TWh</Num> a year, at {num(n.solar_yield)} kWh per kWp.</li>
            <li>The largest tenth of roofs alone ({num(n.solar_top10_gwh / 1000, 1)} TWh) {top10Beats ? "exceeds" : "falls short of"} Uganda's 2024 distribution sales of {num(n.national_sales_gwh / 1000, 1)} TWh (Umeme).</li>
            <li>The real limits are daytime demand, grid absorption, storage and finance. That is the question for the solar chapter.</li>
          </ul>
          <SolarChart c={ch.solar} href={table(ch.solar.source)} />
        </div>
      </Module>

      <footer className="fine stack" style={{ gap: 6 }}>
        <span>Sources: Landsat 8/9 C2 (USGS), Sentinel-2 + Cloud Score+ (ESA, Google), Dynamic World, ESA WorldCover, Open Buildings 2.5D Temporal, Overture Maps 2026-10-21.0, FABDEM V1-2, ERA5-Land (ECMWF), GHS-POP R2023A (JRC), global LCZ map (Demuzere et al. 2022), Umeme Annual Report 2024. Street map © OpenStreetMap contributors, © CARTO.</span>
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
