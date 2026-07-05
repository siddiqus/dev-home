import type { WorkloadEntry, LoadBalance, Ref, RiskLevel } from "../../../types/teams";
import { staleTone } from "./staleTone";

interface Props {
  workload: WorkloadEntry[];
  loadBalance: LoadBalance;
  onOpenRef?: (ref: Ref) => void;
  staleDays?: Map<string, number>;
}

// Import the same status colors from WorkloadBars for consistency
const STATUS_COLORS = {
  new: "#6e7781",
  indeterminate: "#4c8dff",
  inReview: "#e0a458",
  done: "#50c878",
} as const;

const STATUS_ORDER = ["new", "indeterminate", "inReview", "done"] as const;

// Risk level → Bootstrap semantic color for the risk chip.
function getRiskBadgeVariant(level: RiskLevel): string {
  switch (level) {
    case "normal":
      return "success";
    case "attention":
      return "warning";
    case "high":
      return "danger";
  }
}

export function LoadDistribution({ workload, loadBalance, onOpenRef, staleDays }: Props) {
  // Sort workload to surface who needs help: by riskLevel (desc), stalledCount (desc), wip (desc)
  const riskOrder = { high: 3, attention: 2, normal: 1 };
  const sorted = [...workload].sort((a, b) => {
    const riskDiff = riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
    if (riskDiff !== 0) return riskDiff;
    const stalledDiff = b.stalledCount - a.stalledCount;
    if (stalledDiff !== 0) return stalledDiff;
    return b.wip - a.wip;
  });

  const showImbalanceWarning = loadBalance.imbalance >= 3;

  if (workload.length === 0) {
    return (
      <div className="border rounded p-3">
        <h6 className="mb-2">Load Distribution</h6>
        <div className="text-muted small">No team members</div>
      </div>
    );
  }

  const max = Math.max(1, ...workload.map((w) => w.ticketCount));

  return (
    <div className="border rounded p-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div>
          <h6 className="mb-0">Load Distribution</h6>
          <div className="small text-muted" style={{ fontSize: "0.75rem" }}>
            sorted by who needs help
          </div>
        </div>
        {showImbalanceWarning && (
          <span className="badge bg-warning text-dark" style={{ fontSize: "0.75rem" }}>
            Uneven load · {loadBalance.imbalance} ticket spread
          </span>
        )}
      </div>

      <div>
        {sorted.map((w) => (
          <div key={w.accountId} className="mb-2">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="fw-medium" style={{ fontSize: "0.875rem" }}>
                {w.displayName}
              </span>
              <div className="d-flex gap-2 align-items-center" style={{ fontSize: "0.75rem" }}>
                <span className="text-muted">WIP: {w.wip}</span>
                {w.stalledCount > 0 && (
                  <span className="badge bg-danger" style={{ fontSize: "0.6875rem" }}>
                    Stalled: {w.stalledCount}
                  </span>
                )}
                <span className="text-muted">Done: {w.doneCount}</span>
                <span className="text-muted">
                  PRs: {w.prOpen}/{w.prMerged}
                </span>
                <span
                  className={`badge bg-${getRiskBadgeVariant(w.riskLevel)}`}
                  style={{ fontSize: "0.6875rem" }}
                >
                  {w.riskLevel}
                </span>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              <div
                className="d-flex flex-fill"
                style={{
                  background: "rgba(125,125,125,.15)",
                  borderRadius: 3,
                  overflow: "hidden",
                  height: 12,
                }}
              >
                {STATUS_ORDER.map((k) => (
                  <div
                    key={k}
                    title={`${k}: ${w.byStatus[k]}`}
                    style={{
                      width: `${(w.byStatus[k] / max) * 100}%`,
                      height: 12,
                      background: STATUS_COLORS[k],
                    }}
                  />
                ))}
              </div>
            </div>

            {w.stalest &&
              (() => {
                const days = w.stalest.kind === "issue" ? staleDays?.get(w.stalest.key) : undefined;
                return (
                  <div className="mt-1">
                    <button
                      className="btn btn-link btn-sm p-0 text-decoration-none"
                      style={{ fontSize: "0.7rem" }}
                      onClick={() => onOpenRef?.(w.stalest!)}
                    >
                      stalest:{" "}
                      {w.stalest.kind === "issue" ? w.stalest.key : `PR #${w.stalest.number}`}
                      {days != null && (
                        <span style={{ color: staleTone(days), marginLeft: 4 }}>· {days}d</span>
                      )}
                    </button>
                  </div>
                );
              })()}
          </div>
        ))}
      </div>
    </div>
  );
}
