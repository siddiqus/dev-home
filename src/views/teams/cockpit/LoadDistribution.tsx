import { IconAlertTriangle } from "@tabler/icons-react";
import type { WorkloadEntry, LoadBalance, Ref } from "../../../types/teams";
import { flagSummary, sortByNeed } from "./memberSignals";
import { StatusBar, StatusLegend } from "./StatusBar";
import { STALLED_CHIP_STYLE, staleTone } from "./staleTone";

interface Props {
  workload: WorkloadEntry[];
  loadBalance: LoadBalance;
  onOpenRef?: (ref: Ref) => void;
  /** A row was clicked: show this member on the People tab. */
  onSelectMember?: (accountId: string) => void;
  staleDays?: Map<string, number>;
}

export function LoadDistribution({
  workload,
  loadBalance,
  onOpenRef,
  onSelectMember,
  staleDays,
}: Props) {
  // Surface who needs help first.
  const sorted = sortByNeed(workload);

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

      <StatusLegend className="mb-2" />

      <div>
        {sorted.map((w) => (
          <div
            key={w.accountId}
            className="mb-2"
            role="button"
            style={{ cursor: "pointer" }}
            onClick={() => onSelectMember?.(w.accountId)}
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
                {/* Just a nudge to check in; the People tab says which tickets and why.
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

            <StatusBar byStatus={w.byStatus} max={max} height={12} />

            {w.stalest &&
              (() => {
                const days = w.stalest.kind === "issue" ? staleDays?.get(w.stalest.key) : undefined;
                return (
                  <div className="mt-1">
                    <button
                      className="btn btn-link btn-sm p-0 text-decoration-none"
                      style={{ fontSize: "0.7rem" }}
                      onClick={(e) => {
                        // Don't also jump to the People tab (row click).
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
    </div>
  );
}
