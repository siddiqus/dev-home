import type { WorkloadEntry } from "../../types/teams";

interface Props {
  workload: WorkloadEntry[];
  onSelectMember?: (accountId: string | null) => void;
  selectedAccountId?: string | null;
}

function Bars({
  workload,
  metric,
  color,
  onSelectMember,
  selectedAccountId,
}: Props & { metric: "ticketCount" | "prCount"; color: string }) {
  const max = Math.max(1, ...workload.map((w) => w[metric]));
  return (
    <div>
      {workload.map((w) => (
        <div
          key={w.accountId}
          className="d-flex align-items-center gap-2 my-1"
          style={{ cursor: onSelectMember ? "pointer" : "default", fontSize: "0.8125rem" }}
          onClick={() => onSelectMember?.(selectedAccountId === w.accountId ? null : w.accountId)}
        >
          <span style={{ width: 90 }} className="text-truncate">
            {w.displayName}
          </span>
          <div style={{ flex: 1, background: "rgba(125,125,125,.15)", borderRadius: 3 }}>
            <div
              style={{
                width: `${(w[metric] / max) * 100}%`,
                height: 12,
                background: color,
                borderRadius: 3,
                opacity: selectedAccountId && selectedAccountId !== w.accountId ? 0.4 : 1,
              }}
            />
          </div>
          <span style={{ width: 24, textAlign: "right" }}>{w[metric]}</span>
        </div>
      ))}
    </div>
  );
}

export function WorkloadBars(props: Props) {
  return (
    <div className="d-flex gap-3">
      <div className="flex-fill border rounded p-2">
        <div className="small text-muted mb-1">ASSIGNED TICKETS</div>
        <Bars {...props} metric="ticketCount" color="#4c8dff" />
      </div>
      <div className="flex-fill border rounded p-2">
        <div className="small text-muted mb-1">PRs CREATED (2 wk)</div>
        <Bars {...props} metric="prCount" color="#a06bff" />
      </div>
    </div>
  );
}
