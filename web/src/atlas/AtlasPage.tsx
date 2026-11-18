import { useEffect, type ReactNode } from "react";
import { SiteNav } from "../components/SiteNav";
import "./atlas.css";
import { AtlasMap } from "./AtlasMap";
import { atlasUrl, useAtlas } from "./data";
import type { Atlas, ChartKey } from "./types";

function Plate({ src, alt, caption, children }: { src?: string; alt?: string; caption: ReactNode; children?: ReactNode }) {
  return (
    <figure className="plate">
      {children ?? <img src={src} alt={alt} loading="lazy" />}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function Module({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: ReactNode; children: ReactNode }) {
  return (
    <section className="mod" id={id}>
      <div className="mod-head"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      {children}
    </section>
  );
}

const Num = ({ children }: { children: ReactNode }) => <span className="num">{children}</span>;

function Atlas({ atlas }: { atlas: Atlas }) {
  const n = atlas.numbers;
  const [y0, y1, y2] = atlas.years;
  const chart = (k: ChartKey) => atlasUrl(atlas.charts[k]);
  return (
    <>
      <header>
        <span className="eyebrow">PhD research · first full run · dry seasons {y0}, {y1}, {y2}</span>
        <h1>Kampala Heat Atlas</h1>
        <p className="lede">
          How Kampala grew, where it is hottest, who lives in the heat, and what trees and rooftops could do about it. Six
          analyses on one 30 m grid covering the city and its growth frontier.
        </p>
        <span className="coords">0.10–0.55° N · 32.35–32.85° E · UTM 36N · Landsat 8/9, Sentinel-2, Open Buildings 2.5D, Overture, ERA5-Land, FABDEM</span>
        <div className="facts">
          <div className="fact"><span className="tag">Growth</span><b>+{n.builtpct}%</b><span>built-up land, {n.built0} → {n.built2} km² ({y0}–{y2})</span></div>
          <div className="fact"><span className="tag">Heat</span><b className="hot">{n.hot2} km²</b><span>in the hottest class in {y2} ({n.hot0} km² in {y0})</span></div>
          <div className="fact"><span className="tag">Form</span><b className="hot">+{n.inf} °C</b><span>packed low-rise blocks vs the city land mean (other dense +{n.formal} °C)</span></div>
          <div className="fact"><span className="tag">Trees</span><b className="cool">−{n.treecool} °C</b><span>average cooling from {n.newcanopy} km² of new canopy, for about {n.treepeople},000 people</span></div>
          <div className="fact"><span className="tag">Solar</span><b>{n.twh} TWh</b><span>a year from {n.roofs} M roofs ({n.gwp} GWp technical potential)</span></div>
        </div>
      </header>

      <AtlasMap atlas={atlas} />

      <Module id="growth" eyebrow="Module 1 · Urban growth" title="The city added a third more built-up land in eight years">
        <div className="cols">
          <ul className="find">
            <li>Built-up land rose from <Num>{n.built0}</Num> to <Num>{n.built2}</Num> km² between {y0} and {y2}. Growth runs east along the Jinja Road and north into Wakiso.</li>
            <li>The core densified: sparse fabric turned dense across about 112 km².</li>
            <li>Classifier agreement with its training labels is {n.agree} % (kappa 0.78–0.80) on held-out samples.</li>
          </ul>
          <Plate src={chart("class")} alt="Slope chart of land-cover area by class for the three epochs" caption="Area of each land-cover class, three epochs." />
        </div>
        <p className="caveat"><b>Before citing.</b> Agreement with training labels is not map accuracy. 350 validation points still need to be labelled by eye. Tree-cover gains probably include seasonal cropland confusion.</p>
      </Module>

      <Module id="heat" eyebrow="Module 2 · Thermal classification" title="Compact neighbourhoods run 5 to 7 °C above the city">
        <div className="cols">
          <ul className="find">
            <li>The hottest class covers <Num>{n.hot2}</Num> km² in {y2}. About 132 km² are hot in all three epochs: these are the persistent hotspots.</li>
            <li>Compact mid- and low-rise zones are the hottest Local Climate Zones. Large low-rise sheds and warehouses warm fastest. Dense tree cover sits about 2 °C below the mean.</li>
            <li>Surface temperature covers 100 % of the area, against about 60 % for the standard product, and agrees with it at r = {n.r_min}–{n.r_max}.</li>
          </ul>
          <Plate src={chart("lcz")} alt="Dumbbell chart of LST anomaly by Local Climate Zone, 2017 and 2025" caption={`Surface heat by Local Climate Zone, ${y0} and ${y2}.`} />
        </div>
      </Module>

      <Module id="people" eyebrow="Module 3 · Settlements" title="Blocks that packed in fastest warmed most">
        <div className="cols">
          <ul className="find">
            <li>Small, tightly packed low-rise blocks sit <Num>+{n.inf} °C</Num> above the city land mean, about 1 °C hotter than other dense fabric (+{n.formal} °C).</li>
            <li>Blocks that densified into packed low-rise fabric between {y0} and {y2} warmed <Num>{n.became} °C</Num> relative to the city. Blocks already dense in {y0} warmed {n.formalchg} °C.</li>
            <li>Detected well: Kawempe Mbogo, Kazo Angola, Kifumbira, Kalerwe.</li>
          </ul>
          <Plate src={chart("traj")} alt="Line chart of mean LST anomaly by settlement trajectory, three epochs" caption="Thermal trajectories by settlement type." />
        </div>
        <p className="caveat">
          <b>Checked against the literature.</b> Against the 58 informal settlements mapped by the slum dwellers' federation
          (SDI/NSDFU/ACTogether, 2014), georeferenced from their map book: established informal settlements are as hot as other
          dense fabric (+5.2 to +5.9 °C vs +5.4 to +5.5 °C) and warmed less since 2017 (+0.35 to +0.54 vs +0.62 to +0.66 °C;
          ranges over ±250 m georeferencing shifts). The fast warming belongs to blocks that densified, not to informality as
          such. The morphology layer covers 21–29 % of the federation's settlements.
        </p>
      </Module>

      <Module id="trees" eyebrow="Module 4 · Where to plant" title={`${n.vh_km2} km² where heat, people and bare ground meet`}>
        <div className="cols">
          <ul className="find">
            <li>Each extra 10 % of canopy goes with <Num>{n.cool10} °C</Num> cooler surfaces in built-up cells.</li>
            <li>The very-high priority class holds about {n.vh_people},000 residents and almost no trees today (0.3 % canopy).</li>
            <li>Planting half the open land in high and very-high cells adds {n.newcanopy} km² of canopy and cools those cells by about {n.treecool} °C.</li>
          </ul>
          <Plate src={chart("trees")} alt="Bar charts of residents and plantable land by priority class" caption="Residents and plantable land per priority class." />
        </div>
        <p className="caveat"><b>Before citing.</b> The cooling model explains about a third of the variation in surface temperature (R² 0.32). Surface cooling is larger than air-temperature cooling.</p>
      </Module>

      <Module id="cube" eyebrow="Module 0 · The cube" title="Sun overhead, breeze from the lake">
        <div className="cols">
          <ul className="find">
            <li>At 0.3° N the noon sun never drops below 66°. Flat or 5–10° panels are best; tilt changes yield by under 1.5 %.</li>
            <li>East and west walls take about 2.1 times the direct sun of north and south walls. Long axes should run east–west.</li>
            <li>From 09:00 the Lake Victoria breeze builds from the south, peaking at 15:00 (74 % of hours from S or SE). Long south facades catch it; north–south gaps let it through.</li>
          </ul>
          <Plate src={atlasUrl(atlas.anims.wind)} alt="Animated wind rose cycling through 24 hours" caption="Wind direction through the day, ERA5-Land 2015–2024." />
        </div>
        <Plate caption={`Central Kampala, 5.4 × 5.4 km: FABDEM terrain plus Open Buildings heights, coloured by ${y2} surface heat relative to the window.`}>
          <img className="anim" src={atlasUrl(atlas.anims.cube)} alt="Rotating 3D model of central Kampala terrain and buildings coloured by surface heat" loading="lazy" />
          <img className="anim-still" src={chart("cube")} alt="3D model of central Kampala" loading="lazy" />
        </Plate>
      </Module>

      <Module id="solar" eyebrow="Module 5 · Rooftop solar" title="Roof space is not the constraint">
        <div className="cols">
          <ul className="find">
            <li>{n.roofs} million roofs could host about <Num>{n.gwp} GWp</Num> and generate <Num>{n.twh} TWh</Num> a year, at {n.yield_} kWh per kWp.</li>
            <li>The largest tenth of roofs alone exceeds Uganda's 2024 distribution sales of 4.7 TWh (Umeme).</li>
            <li>The real limits are daytime demand, grid absorption, storage and finance. That is the question for the solar chapter.</li>
          </ul>
          <Plate src={chart("solar")} alt="Bar chart of generation under adoption scenarios against national sales" caption="Generation under adoption scenarios." />
        </div>
      </Module>

      <footer>
        <span>Sources: Landsat 8/9 C2 (USGS), Sentinel-2 + Cloud Score+ (ESA, Google), Dynamic World, ESA WorldCover, Open Buildings 2.5D Temporal, Overture Maps 2026-10-21.0, FABDEM V1-2, ERA5-Land (ECMWF), GHS-POP R2023A (JRC), global LCZ map (Demuzere et al. 2022), Umeme Annual Report 2024.</span>
        <span>First-pass results. Several layers carry open validation items, listed with each module.</span>
      </footer>
    </>
  );
}

/** The 2D atlas. `section` scrolls to a module (#/atlas/heat), so links to the old page's #heat still land. */
export function AtlasPage({ section }: { section?: string }) {
  const atlas = useAtlas();
  useEffect(() => {
    document.title = "Kampala Heat Atlas";
  }, []);
  useEffect(() => {
    if (atlas.state === "ready" && section) document.getElementById(section)?.scrollIntoView();
  }, [atlas.state, section]);

  return (
    <div className="atlas-page">
      <div className="wrap">
        <SiteNav current="atlas" />
        {atlas.state === "loading" && <p className="lede">Loading the atlas…</p>}
        {atlas.state === "error" && <p className="lede">The atlas data could not be loaded ({atlas.message}).</p>}
        {atlas.state === "ready" && <Atlas atlas={atlas.data} />}
      </div>
    </div>
  );
}
