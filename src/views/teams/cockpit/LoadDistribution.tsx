import type { WorkloadEntry, LoadBalance } from "../../../types/teams";
import { sortByNeed } from "./memberSignals";
import { PersonRow } from "./PersonRow";
import { StatusLegend } from "./StatusBar";

interface Props {
  workload: WorkloadEntry[];
  loadBalance: LoadBalance;
  /** A row was clicked: show this member on the People tab. */
  onSelectMember?: (accountId: string) => void;
}

export function LoadDistribution({ workload, loadBalance, onSelectMember }: Props) {
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

      <div className="work-spread__list">
        {sorted.map((w) => (
          <PersonRow
            key={w.accountId}
            member={w}
            max={max}
            onClick={() => onSelectMember?.(w.accountId)}
          />
        ))}
      </div>
    </div>
  );
}
