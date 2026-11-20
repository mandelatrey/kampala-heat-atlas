import { useState } from "react";
import { dataUrl } from "../../lib";

const DAY = dataUrl("figures/modis_day_2025.png");
const NIGHT = dataUrl("figures/modis_night_2025.png");

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
        The same satellite passes twice a day. Drag the line to compare early afternoon (about 1:30 pm, left) with the middle of
        the night (about 1:30 am, right), in the 2025 dry season. Red is warmer than the rest of the area at that hour, blue cooler.
      </p>
      <div
        className="daynight"
        role="img"
        aria-label="Surface heat around Kampala by day (left of the line) and at night (right of the line)"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && drag(e)}
      >
        <img src={NIGHT} alt="" loading="lazy" />
        <img src={DAY} alt="" loading="lazy" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
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
