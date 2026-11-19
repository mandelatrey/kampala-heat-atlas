// Find your area: the search box above the map, and the card that sums up the atlas around a place.
import { useId, useMemo, useState } from "react";
import { Icon } from "../components/ui";
import { cutsAt, cutsSentence, kampalaToday, plannedNear, plannedSentence, usePower } from "../power/cuts";
import { placeContext, searchPlaces, type Place } from "./places";
import { summaryLines, type AreaSummary } from "./summary";

export interface Focus {
  lat: number;
  lon: number;
  /** A searched place's name, or null for a tapped spot. */
  name: string | null;
  /** e.g. "suburb near Kawempe", or "near Kawempe" for a tapped spot */
  context: string | null;
}

export function PlaceSearch({ places, onPick, onLocate, locating, title = "Find your area", hint = "How hot is it, has it changed, and what could help?" }: {
  places: Place[]; onPick: (f: Focus) => void; onLocate?: () => void; locating?: boolean; title?: string; hint?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const hits = useMemo(() => searchPlaces(places, q), [places, q]);
  const pick = (p: Place) => {
    onPick({ lat: p.lat, lon: p.lon, name: p.name, context: placeContext(p, places) });
    setQ(p.name);
    setOpen(false);
  };
  const shown = open && hits.length > 0;
  return (
    <div className="map-search">
      <label className="search-label" htmlFor={`${id}-q`}>
        <span className="eyebrow">{title}</span>
        {hint && <span className="search-hint">{hint}</span>}
      </label>
      <div className="search-row">
        <div className="search-box">
          <Icon.search />
          <input
            id={`${id}-q`} type="search" value={q} placeholder="Neighbourhood, e.g. Kawempe, Ntinda, Kisenyi" autoComplete="off"
            role="combobox" aria-expanded={shown} aria-controls={`${id}-list`} aria-autocomplete="list"
            aria-activedescendant={shown ? `${id}-o${active}` : undefined}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (!shown) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % hits.length); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + hits.length) % hits.length); }
              else if (e.key === "Enter") { e.preventDefault(); const p = hits[active]; if (p) pick(p); }
              else if (e.key === "Escape") setOpen(false);
            }}
          />
          {shown && (
            <ul className="search-list" id={`${id}-list`} role="listbox" aria-label="Places">
              {hits.map((p, i) => (
                <li
                  key={`${p.name}-${p.lat}-${p.lon}`} id={`${id}-o${i}`} role="option" aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)}
                >
                  <b>{p.name}</b><span>{placeContext(p, places)}</span>
                </li>
              ))}
            </ul>
          )}
          {open && q.trim().length >= 2 && hits.length === 0 && places.length > 0 && (
            <div className="search-list empty" role="status">No place by that name in the atlas area. Try a nearby name, or tap the map.</div>
          )}
        </div>
        {onLocate && (
          <button type="button" className="btn" onClick={onLocate} disabled={locating}>
            <Icon.map /> {locating ? "Finding you…" : "Near me"}
          </button>
        )}
      </div>
    </div>
  );
}

type SummaryState = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: AreaSummary };

export function PlaceCard({ focus, summary, firstYear, radiusM, onClose }: {
  focus: Focus; summary: SummaryState; firstYear: number; radiusM: number; onClose: () => void;
}) {
  const lines = summary.state === "ready" ? summaryLines(summary.data, firstYear) : [];
  const powerLoad = usePower();
  const power = powerLoad.state === "ready" ? powerLoad.data : null;
  const cuts = power?.areas.length ? cutsSentence(cutsAt(power, focus)) : null;
  const planned = power ? plannedNear(power, focus, kampalaToday()) : [];
  const soon = (iso: string) => (new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${kampalaToday()}T00:00:00Z`).getTime()) / 86400000 <= 6;
  return (
    <section className="place-card" aria-label={`Summary for ${focus.name ?? "this spot"}`} aria-live="polite">
      <header>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">Within {radiusM} m of</span>
          <h3>{focus.name ?? "This spot"}</h3>
          {focus.context && <span className="muted">{focus.context}</span>}
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Close the summary"><Icon.close size={16} /></button>
      </header>
      {summary.state === "loading" && <p className="muted">Reading the atlas layers…</p>}
      {summary.state === "error" && <p className="muted">The summary could not be made ({summary.message}).</p>}
      {summary.state === "ready" && summary.data.cells === 0 && <p className="muted">This spot is outside the atlas area.</p>}
      {summary.state === "ready" && summary.data.cells > 0 && lines.length === 0 && <p className="muted">The atlas has no data around this spot.</p>}
      {(lines.length > 0 || cuts || planned.length > 0) && (
        <dl>
          {planned.map((p) => (
            <div key={`${p.date}-${p.start}-${p.area}`} className="fact-line t-warn">
              <dt>Planned power cut</dt>
              <dd>{plannedSentence(p)}{soon(p.date) && <> Hot day? <a href="#/heat">Check the heat outlook</a>: without fans or a fridge, keep water, food and medicines cool and shaded.</>}</dd>
            </div>
          ))}
          {lines.map((l) => (
            <div key={l.topic} className={`fact-line t-${l.tone ?? "neutral"}`}>
              <dt>{l.title}</dt>
              <dd>{l.text}</dd>
            </div>
          ))}
          {cuts && (
            <div className={`fact-line t-${cuts.tone}`}>
              <dt>Power cuts</dt>
              <dd>{cuts.text} <a href="#/atlas/solar">What would a battery cover?</a></dd>
            </div>
          )}
        </dl>
      )}
      <p className="fine">
        Ground and roof temperature from satellites, not the air temperature you feel. First-pass research results; see each
        module below for the caveats.
      </p>
    </section>
  );
}
