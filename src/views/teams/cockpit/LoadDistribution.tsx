import { useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { DashboardIssue, WorkloadEntry, LoadBalance, Ref } from "../../../types/teams";
import { MemberModal } from "./MemberModal";
import { STATUS_COLORS, STATUS_LABELS, flagSummary } from "./memberSignals";
import { STALLED_CHIP_STYLE, staleTone } from "./staleTone";

interface Props {
  workload: WorkloadEntry[];
  loadBalance: LoadBalance;
  /** Every sprint issue, for the member modal's ticket list. */
  issues: DashboardIssue[];
  onOpenRef?: (ref: Ref) => void;
  staleDays?: Map<string, number>;
}

const STATUS_ORDER = ["new", "indeterminate", "inReview", "done"] as const;

export function LoadDistribution({ workload, loadBalance, issues, onOpenRef, staleDays }: Props) {
  // The member whose detail modal is open, or null when closed.
  const [selected, setSelected] = useState<WorkloadEntry | null>(null);

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
        <h6 className="mb-2">Work Spread</h6>
        <div className="text-muted small">No team members</div>
      </div>
    );
  }

  const max = Math.max(1, ...workload.map((w) => w.ticketCount));

  return (
    <div className="border rounded p-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div>
          <h6 className="mb-0">Work Spread</h6>
        </div>
        {showImbalanceWarning && (
          <span className="badge bg-warning text-dark" style={{ fontSize: "0.75rem" }}>
            Uneven load · {loadBalance.imbalance} ticket spread
          </span>
        )}
      </div>

      {/* Legend for the stacked status bars. */}
      <div
        className="d-flex flex-wrap gap-3 mb-2 text-muted"
        style={{ fontSize: "0.75rem" }}
        aria-label="Bar colors"
      >
        {STATUS_ORDER.map((k) => (
          <span key={k} className="d-inline-flex align-items-center gap-1">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: STATUS_COLORS[k],
                display: "inline-block",
              }}
            />
            {STATUS_LABELS[k]}
          </span>
        ))}
      </div>

      <div>
        {sorted.map((w) => (
          <div
            key={w.accountId}
            className="mb-2"
            role="button"
            style={{ cursor: "pointer" }}
            onClick={() => setSelected(w)}
          >
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="fw-medium" style={{ fontSize: "0.875rem" }}>
                {w.displayName}
              </span>
              <div className="d-flex gap-2 align-items-center" style={{ fontSize: "0.75rem" }}>
                <span className="text-muted">WIP: {w.wip}</span>
                {w.stalledCount > 0 && (
                  <span
                    className="badge rounded-pill"
                    style={{ fontSize: "0.6875rem", ...STALLED_CHIP_STYLE }}
                  >
                    Stalled: {w.stalledCount}
                  </span>
                )}
                <span className="text-muted">Done: {w.doneCount}</span>
                <span className="text-muted">
                  PRs: {w.prOpen}/{w.prMerged}
                </span>
                {/* Just a nudge to check in; the modal says which tickets and why.
                    No label beside a name on a shared standup screen. */}
                {w.atRiskIssues.length > 0 && (
                  <span
                    className="work-spread-flag"
                    title={`Check in: ${flagSummary(w.atRiskIssues)}`}
                    aria-label={`Check in: ${flagSummary(w.atRiskIssues)}`}
                  >
                    <IconAlertTriangle size={15} />
                  </span>
                )}
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
                    title={`${STATUS_LABELS[k]}: ${w.byStatus[k]}`}
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
                      onClick={(e) => {
                        // Don't also open the member modal (row click).
                        e.stopPropagation();
                        onOpenRef?.(w.stalest!);
                      }}
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

      <MemberModal
        member={selected}
        issues={issues}
        onHide={() => setSelected(null)}
        onOpenRef={onOpenRef}
      />
    </div>
  );
}
