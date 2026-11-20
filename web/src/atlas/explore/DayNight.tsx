import { useState } from "react";
import { dataUrl } from "../../lib";
import { toUtm } from "../geo";

const DAY = dataUrl("figures/modis_day_2025.png");
const NIGHT = dataUrl("figures/modis_night_2025.png");

// Where the pictures sit: MODIS cells of 1 km in UTM 36N, snapped by the download to whole kilometres around the
// study area ([32.35, 0.10, 32.85, 0.55] in config.yaml), so 57 x 50 cells from these edges, in metres.
const WEST = 427000, EAST = 484000, SOUTH = 11000, NORTH = 61000;
const KM_WIDE = (EAST - WEST) / 1000;

/** Position of a point on the pictures, as % from the left and from the top. */
function spot(lat: number, lon: number): { left: string; top: string } {
  const [x, y] = toUtm(lat, lon, 36);
  return { left: `${((x - WEST) / (EAST - WEST)) * 100}%`, top: `${((NORTH - y) / (NORTH - SOUTH)) * 100}%` };
}

// Well-known places spread over the area (positions from OpenStreetMap, as in places.json)
const LABELS: { name: string; lat: number; lon: number; big?: boolean }[] = [
  { name: "Kampala centre", lat: 0.31771, lon: 32.58136, big: true },
  { name: "Nansana", lat: 0.36582, lon: 32.52922 },
  { name: "Gayaza", lat: 0.45179, lon: 32.61114 },
  { name: "Mukono", lat: 0.36085, lon: 32.74609 },
  { name: "Kyengera", lat: 0.29461, lon: 32.5021 },
  { name: "Kajjansi", lat: 0.21054, lon: 32.54267 },
  { name: "Munyonyo", lat: 0.24455, lon: 32.62175 },
];
const LAKE = spot(0.17, 32.7);

/** "Does it cool down at night?": the 2025 day and night surface heat, compared with a divider. */
export function DayNight() {
  const [pos, setPos] = useState(50);                 // % of the width showing the day picture
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos(Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))));
  };
  return (
    <section className="explore-card" aria-labelledby="daynight-title">
      <h3 id="daynight-title">Does it cool down at night?</h3>
      <p className="muted">
        Kampala and the towns around it, about {KM_WIDE} by {(NORTH - SOUTH) / 1000} km: the same area as the map above. The same
        satellite passes twice a day. Drag the line to compare early afternoon (about 1:30 pm, left) with the middle of the night
        (about 1:30 am, right), in the 2025 dry season. Red is warmer than the rest of the area at that hour, blue cooler.
      </p>
      <div
        className="daynight"
        role="img"
        aria-label="Surface heat over Kampala and the surrounding towns down to Lake Victoria, by day (left of the line) and at night (right of the line)"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && drag(e)}
      >
        <img src={NIGHT} alt="" loading="lazy" />
        <img src={DAY} alt="" loading="lazy" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
        <span className="daynight-lake" style={LAKE} aria-hidden="true">Lake Victoria</span>
        {LABELS.map((l) => (
          <span key={l.name} className={`daynight-place${l.big ? " big" : ""}`} style={spot(l.lat, l.lon)} aria-hidden="true">{l.name}</span>
        ))}
        <span className="daynight-scale" style={{ width: `${(10 / KM_WIDE) * 100}%` }} aria-hidden="true"><i />10 km</span>
        <span className="daynight-line" style={{ left: `${pos}%` }} aria-hidden="true" />
        <span className="daynight-tag left" aria-hidden="true">Day</span>
        <span className="daynight-tag right" aria-hidden="true">Night</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))}
        aria-label="How much of the map shows the day" aria-valuetext={`${pos} % day, ${100 - pos} % night`} />
      <div className="daynight-key" aria-hidden="true"><i className="cool" /> cooler <i className="warm" /> warmer, at that hour</div>
      <p>
        By day, the lake and wetlands are cool and the packed centre is the hottest part of the city. At night the lake is the
        warmest surface, and the packed centre still stays warmer than the hills around it. That leftover heat is what keeps
        people in small, crowded rooms from cooling down at night.
      </p>
      <p className="muted">Each square is about 1 km across (MODIS Aqua), much coarser than the map above.</p>
    </section>
  );
}
