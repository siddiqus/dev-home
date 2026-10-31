import type { WorkloadEntry } from "../../../types/teams";
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER } from "./memberSignals";

/** What the status bar colors mean. */
export function StatusLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`status-legend ${className}`} aria-label="Bar colors">
      {STATUS_ORDER.map((k) => (
        <span key={k} className="status-legend__item">
          <span className="status-legend__swatch" style={{ background: STATUS_COLORS[k] }} />
          {STATUS_LABELS[k]}
        </span>
      ))}
    </div>
  );
}

/**
 * A member's tickets as one stacked bar. Widths are against `max` (the team's
 * biggest load), so bars compare people, not just a person's own mix.
 */
export function StatusBar({
  byStatus,
  max,
  height,
}: {
  byStatus: WorkloadEntry["byStatus"];
  max: number;
  height: number;
}) {
  return (
    <div className="status-bar" style={{ height, borderRadius: height / 4 }} aria-hidden>
      {STATUS_ORDER.map((k) => (
        <div
          key={k}
          title={`${STATUS_LABELS[k]}: ${byStatus[k]}`}
          style={{ width: `${(byStatus[k] / max) * 100}%`, background: STATUS_COLORS[k] }}
        />
      ))}
    </div>
  );
}
