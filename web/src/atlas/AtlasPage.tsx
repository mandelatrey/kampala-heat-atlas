import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/ui";
import { AtlasMap } from "./AtlasMap";
import { atlasUrl, useAtlas } from "./data";
import type { Atlas, ChartKey } from "./types";
import "./atlas.css";

// Which map layer each module is about ("Show on map").
const MODULE_LAYER: Record<string, string> = {
  growth: "growth", heat: "thermal-2025", people: "informal-2025", trees: "trees", cube: "lst-2025", solar: "solar",
};

const Num = ({ children }: { children: ReactNode }) => <span className="num-hi">{children}</span>;

function Figure({ src, alt, caption }: { src: string; alt: string; caption: ReactNode }) {
  return (
    <figure className="plate">
      <img src={src} alt={alt} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

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

function Content({ atlas, mapRef }: { atlas: Atlas; mapRef: React.RefObject<HTMLElement | null> }) {
  const n = atlas.numbers;
  const [y0, y1, y2] = atlas.years;
  const chart = (k: ChartKey) => atlasUrl(atlas.charts[k]);
  const [layerId, setLayerId] = useState(atlas.layers[0]?.id ?? "");
  const show = (id: string) => {
    setLayerId(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const facts: { tag: string; value: ReactNode; tone?: "hot" | "cool"; text: ReactNode; module: string }[] = [
    { tag: "Growth", value: `+${n.builtpct}%`, text: <>built-up land, {n.built0} → {n.built2} km² ({y0}–{y2})</>, module: "growth" },
    { tag: "Heat", value: `${n.hot2} km²`, tone: "hot", text: <>in the hottest class in {y2} ({n.hot0} km² in {y0})</>, module: "heat" },
    { tag: "Form", value: `+${n.inf} °C`, tone: "hot", text: <>packed low-rise blocks vs the city land mean (other dense +{n.formal} °C)</>, module: "people" },
    { tag: "Trees", value: `−${n.treecool} °C`, tone: "cool", text: <>average cooling from {n.newcanopy} km² of new canopy, for about {n.treepeople},000 people</>, module: "trees" },
    { tag: "Solar", value: `${n.twh} TWh`, text: <>a year from {n.roofs} M roofs ({n.gwp} GWp technical potential)</>, module: "solar" },
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

      <Module id="growth" n="1" eyebrow="Urban growth" title="The city added a third more built-up land in eight years" atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>Built-up land rose from <Num>{n.built0}</Num> to <Num>{n.built2}</Num> km² between {y0} and {y2}. Growth runs east along the Jinja Road and north into Wakiso.</li>
            <li>The core densified: sparse fabric turned dense across about 112 km².</li>
            <li>Classifier agreement with its training labels is {n.agree} % (kappa 0.78–0.80) on held-out samples.</li>
          </ul>
          <Figure src={chart("class")} alt="Slope chart of land-cover area by class for the three epochs" caption="Area of each land-cover class, three epochs." />
        </div>
        <p className="callout"><b>Before citing.</b> Agreement with training labels is not map accuracy. 350 validation points still need to be labelled by eye. Tree-cover gains probably include seasonal cropland confusion.</p>
      </Module>

      <Module id="heat" n="2" eyebrow="Thermal classification" title="Compact neighbourhoods run 5 to 7 °C above the city" atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>The hottest class covers <Num>{n.hot2}</Num> km² in {y2}. About 132 km² are hot in all three epochs: these are the persistent hotspots.</li>
            <li>Compact mid- and low-rise zones are the hottest Local Climate Zones. Large low-rise sheds and warehouses warm fastest. Dense tree cover sits about 2 °C below the mean.</li>
            <li>Surface temperature covers 100 % of the area, against about 60 % for the standard product, and agrees with it at r = {n.r_min}–{n.r_max}.</li>
          </ul>
          <Figure src={chart("lcz")} alt="Dumbbell chart of LST anomaly by Local Climate Zone, 2017 and 2025" caption={`Surface heat by Local Climate Zone, ${y0} and ${y2}.`} />
        </div>
      </Module>

      <Module id="people" n="3" eyebrow="Settlements" title="Blocks that packed in fastest warmed most" atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>Small, tightly packed low-rise blocks sit <Num>+{n.inf} °C</Num> above the city land mean, about 1 °C hotter than other dense fabric (+{n.formal} °C).</li>
            <li>Blocks that densified into packed low-rise fabric between {y0} and {y2} warmed <Num>{n.became} °C</Num> relative to the city. Blocks already dense in {y0} warmed {n.formalchg} °C.</li>
            <li>Detected well: Kawempe Mbogo, Kazo Angola, Kifumbira, Kalerwe.</li>
          </ul>
          <Figure src={chart("traj")} alt="Line chart of mean LST anomaly by settlement trajectory, three epochs" caption="Thermal trajectories by settlement type." />
        </div>
        <p className="callout">
          <b>Checked against the literature.</b> Against the 58 informal settlements mapped by the slum dwellers' federation
          (SDI/NSDFU/ACTogether, 2014), georeferenced from their map book: established informal settlements are as hot as other
          dense fabric (+5.2 to +5.9 °C vs +5.4 to +5.5 °C) and warmed less since 2017 (+0.35 to +0.54 vs +0.62 to +0.66 °C;
          ranges over ±250 m georeferencing shifts). The fast warming belongs to blocks that densified, not to informality as
          such. The morphology layer covers 21–29 % of the federation's settlements.
        </p>
      </Module>

      <Module id="trees" n="4" eyebrow="Where to plant" title={`${n.vh_km2} km² where heat, people and bare ground meet`} atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>Each extra 10 % of canopy goes with <Num>{n.cool10} °C</Num> cooler surfaces in built-up cells.</li>
            <li>The very-high priority class holds about {n.vh_people},000 residents and almost no trees today (0.3 % canopy).</li>
            <li>Planting half the open land in high and very-high cells adds {n.newcanopy} km² of canopy and cools those cells by about {n.treecool} °C.</li>
          </ul>
          <Figure src={chart("trees")} alt="Bar charts of residents and plantable land by priority class" caption="Residents and plantable land per priority class." />
        </div>
        <p className="callout"><b>Before citing.</b> The cooling model explains about a third of the variation in surface temperature (R² 0.32). Surface cooling is larger than air-temperature cooling.</p>
      </Module>

      <Module id="cube" n="0" eyebrow="The cube" title="Sun overhead, breeze from the lake" atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>At 0.3° N the noon sun never drops below 66°. Flat or 5–10° panels are best; tilt changes yield by under 1.5 %.</li>
            <li>East and west walls take about 2.1 times the direct sun of north and south walls. Long axes should run east–west.</li>
            <li>From 09:00 the Lake Victoria breeze builds from the south, peaking at 15:00 (74 % of hours from S or SE). Long south facades catch it; north–south gaps let it through.</li>
          </ul>
          <Figure src={atlasUrl(atlas.anims.wind)} alt="Animated wind rose cycling through 24 hours" caption="Wind direction through the day, ERA5-Land 2015–2024." />
        </div>
        <figure className="plate">
          <img className="anim" src={atlasUrl(atlas.anims.cube)} alt="Rotating 3D model of central Kampala terrain and buildings coloured by surface heat" loading="lazy" />
          <img className="anim-still" src={chart("cube")} alt="3D model of central Kampala" loading="lazy" />
          <figcaption>Central Kampala, 5.4 × 5.4 km: FABDEM terrain plus Open Buildings heights, coloured by {y2} surface heat relative to the window.</figcaption>
        </figure>
      </Module>

      <Module id="solar" n="5" eyebrow="Rooftop solar" title="Roof space is not the constraint" atlas={atlas} onShow={show}>
        <div className="cols">
          <ul className="find">
            <li>{n.roofs} million roofs could host about <Num>{n.gwp} GWp</Num> and generate <Num>{n.twh} TWh</Num> a year, at {n.yield_} kWh per kWp.</li>
            <li>The largest tenth of roofs alone exceeds Uganda's 2024 distribution sales of 4.7 TWh (Umeme).</li>
            <li>The real limits are daytime demand, grid absorption, storage and finance. That is the question for the solar chapter.</li>
          </ul>
          <Figure src={chart("solar")} alt="Bar chart of generation under adoption scenarios against national sales" caption="Generation under adoption scenarios." />
        </div>
      </Module>

      <footer className="fine stack" style={{ gap: 6 }}>
        <span>Sources: Landsat 8/9 C2 (USGS), Sentinel-2 + Cloud Score+ (ESA, Google), Dynamic World, ESA WorldCover, Open Buildings 2.5D Temporal, Overture Maps 2026-10-21.0, FABDEM V1-2, ERA5-Land (ECMWF), GHS-POP R2023A (JRC), global LCZ map (Demuzere et al. 2022), Umeme Annual Report 2024.</span>
        <span>First-pass results. Several layers carry open validation items, listed with each module.</span>
      </footer>
    </>
  );
}

/** The 2D atlas. `section` scrolls to a module (#/atlas/heat), so links to the old page's #heat still land. */
export function AtlasPage({ section }: { section?: string }) {
  const atlas = useAtlas();
  const mapRef = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = "Kampala Heat Atlas";
  }, []);
  useEffect(() => {
    if (atlas.state !== "ready" || !section) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(section)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [atlas.state, section]);

  return (
    <div className="page atlas-page">
      {atlas.state === "loading" && <p className="state">Loading the atlas…</p>}
      {atlas.state === "error" && <p className="state">The atlas data could not be loaded ({atlas.message}).</p>}
      {atlas.state === "ready" && <Content atlas={atlas.data} mapRef={mapRef} />}
    </div>
  );
}
