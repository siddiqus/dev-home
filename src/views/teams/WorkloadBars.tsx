import type { WorkloadEntry } from "../../types/teams";

interface Props {
  workload: WorkloadEntry[];
  onSelectMember?: (accountId: string | null) => void;
  selectedAccountId?: string | null;
}

// Colors for the stacked ticket bar (To Do / In Progress / In Review / Done).
export const STATUS_COLORS = {
  new: "#6e7781",
  indeterminate: "#4c8dff",
  inReview: "#e0a458",
  done: "#50c878",
} as const;

const STATUS_LABELS = {
  new: "To Do",
  indeterminate: "In Progress",
  inReview: "In Review",
  done: "Done",
} as const;

// Segment order, shared by the bars and the legend so they stay in sync.
const STATUS_ORDER = ["new", "indeterminate", "inReview", "done"] as const;

function rowStyle(
  isSelected: boolean,
  hasSelection: boolean,
  onSelectMember?: (accountId: string | null) => void,
) {
  return {
    cursor: onSelectMember ? "pointer" : "default",
    fontSize: "0.8125rem",
    opacity: hasSelection && !isSelected ? 0.4 : 1,
  } as const;
}

/** Single-color bar (used for PR counts). */
function SimpleBars({
  workload,
  metric,
  color,
  onSelectMember,
  selectedAccountId,
}: Props & { metric: "prCount"; color: string }) {
  const max = Math.max(1, ...workload.map((w) => w[metric]));
  return (
    <div>
      {workload.map((w) => (
        <div
          key={w.accountId}
          className="d-flex align-items-center gap-2 my-1"
          style={rowStyle(selectedAccountId === w.accountId, !!selectedAccountId, onSelectMember)}
          onClick={() => onSelectMember?.(selectedAccountId === w.accountId ? null : w.accountId)}
        >
          <span style={{ width: 120 }} className="text-truncate">
            {w.displayName}
          </span>
          <div style={{ flex: 1, background: "rgba(125,125,125,.15)", borderRadius: 3 }}>
            <div
              style={{
                width: `${(w[metric] / max) * 100}%`,
                height: 12,
                background: color,
                borderRadius: 3,
              }}
            />
          </div>
          <span style={{ width: 24, textAlign: "right" }}>{w[metric]}</span>
        </div>
      ))}
    </div>
  );
}

/** Stacked bar broken down by status category, so you can see who has how many
 * tickets in what status at a glance. */
function TicketBars({ workload, onSelectMember, selectedAccountId }: Props) {
  const max = Math.max(1, ...workload.map((w) => w.ticketCount));
  return (
    <div>
      {workload.map((w) => (
        <div
          key={w.accountId}
          className="d-flex align-items-center gap-2 my-1"
          style={rowStyle(selectedAccountId === w.accountId, !!selectedAccountId, onSelectMember)}
          onClick={() => onSelectMember?.(selectedAccountId === w.accountId ? null : w.accountId)}
        >
          <span style={{ width: 120 }} className="text-truncate">
            {w.displayName}
          </span>
          <div
            className="d-flex"
            style={{
              flex: 1,
              background: "rgba(125,125,125,.15)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            {STATUS_ORDER.map((k) => (
              <div
                key={k}
                title={`${STATUS_LABELS[k]}: ${w.byStatus[k]}`}
                style={{
                  width: `${(w.byStatus[k] / max) * 100}%`,
                  height: 12,
                  background: STATUS_COLORS[k],
                }}
              />
            ))}
          </div>
          <span style={{ width: 24, textAlign: "right" }}>{w.ticketCount}</span>
        </div>
      ))}
    </div>
  );
}

export function WorkloadBars(props: Props) {
  return (
    <div className="d-flex gap-3">
      <div className="border rounded p-2" style={{ flex: "1 1 0", minWidth: 0 }}>
        <div className="small text-muted mb-1 d-flex justify-content-between">
          <span>ASSIGNED TICKETS</span>
          <span style={{ fontSize: "0.6875rem" }}>
            {STATUS_ORDER.map((k) => (
              <span key={k}>
                <span style={{ color: STATUS_COLORS[k] }}>■</span> {STATUS_LABELS[k]}{" "}
              </span>
            ))}
          </span>
        </div>
        <TicketBars {...props} />
      </div>
      <div className="border rounded p-2" style={{ flex: "1 1 0", minWidth: 0 }}>
        <div className="small text-muted mb-1">PRs CREATED (2 wk)</div>
        <SimpleBars {...props} metric="prCount" color="#a06bff" />
      </div>
    </div>
  );
}
