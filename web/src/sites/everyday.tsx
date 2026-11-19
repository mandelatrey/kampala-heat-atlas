// Everyday advice for the public (scripts/everyday.py): every activity for the day, grouped, with the same
// go / with care / stop strip as the trades.
import { StatusPill } from "../components/ui";
import type { Everyday } from "../types";
import { STATUS_WORD, statusTone } from "./logic";
import { HourCells } from "./parts";

export function ActivityTable({ ev, day }: { ev: Everyday; day: string }) {
  const hours = ev.rows[0]?.hours ?? [];
  return (
    <section className="card card-pad trades everyday" aria-label="Plan your day">
      <div className="card-head">
        <div className="stack" style={{ gap: 2 }}>
          <h2>Plan your day</h2>
          <span className="muted" style={{ fontSize: 13 }}>{day} · {ev.hours.replace("-", " to ")}</span>
        </div>
        <div className="legend-row" aria-label="Key">
          <span><span className="cell c-good" />Fine</span>
          <span><span className="cell c-warning" />With care</span>
          <span><span className="cell c-critical" />Avoid</span>
        </div>
      </div>
      <div className="trade-grid">
        <div className="trade-hours" aria-hidden="true">
          <span />
          <div className="cells head">
            {hours.map(([h]) => <span key={h} className="cell">{String(h).padStart(2, "0")}</span>)}
          </div>
          <span />
        </div>
        {ev.groups.map((g) => {
          const rows = ev.rows.filter((r) => r.group === g);
          if (rows.length === 0) return null;
          return (
            <div className="activity-group" key={g} role="group" aria-label={g}>
              <span className="eyebrow group-name">{g}</span>
              {rows.map((r) => (
                <div className="trade" key={r.key}>
                  <div className="trade-name">
                    <b>{r.name}</b>
                    <StatusPill tone={statusTone(r.status)}>{r.status === "GO" ? STATUS_WORD.GO : r.label}</StatusPill>
                  </div>
                  <HourCells row={r} name={r.name} />
                  <span className="trade-go num" title="Hours with no weather limit">{r.go_hours} h</span>
                  <p className="trade-act">
                    {r.causes.length > 0 && <span className="muted">Because of {r.causes.join(", ")}. </span>}
                    {r.action}
                  </p>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
