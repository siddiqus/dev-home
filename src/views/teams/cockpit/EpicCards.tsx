import type { DashboardEpic, Ref } from "../../../types/teams";

interface Props {
  epics: DashboardEpic[];
  onOpenRef?: (ref: Ref) => void;
}

export function EpicCards({ epics, onOpenRef }: Props) {
  if (epics.length === 0) {
    return (
      <div className="border rounded p-3 text-center text-muted">
        <small>No epics</small>
      </div>
    );
  }

  return (
    <div className="border rounded p-2">
      <div className="small text-muted mb-2">Epics · {epics.length}</div>
      <div className="d-flex gap-2 flex-wrap">
        {epics.map((epic) => {
          const isNoEpic = epic.key === null;
          const progressPct = epic.total > 0 ? (epic.done / epic.total) * 100 : 0;
          const hasStalled = epic.stalled > 0;

          return (
            <div
              key={epic.key ?? "none"}
              className={`border rounded p-2 ${isNoEpic ? "border-2 border-dashed" : ""}`}
              style={{
                flex: "1 1 160px",
                fontSize: "0.8125rem",
                cursor: epic.key ? "pointer" : undefined,
                opacity: isNoEpic ? 0.7 : 1,
              }}
              onClick={epic.key ? () => onOpenRef?.({ kind: "issue", key: epic.key! }) : undefined}
              title={epic.key ? `View ${epic.key}` : "Synthetic bucket for tickets without an epic"}
            >
              <div className={`fw-semibold text-truncate ${isNoEpic ? "text-muted" : ""}`}>
                {epic.name}
              </div>
              <div className="text-muted mb-1">
                {epic.done}/{epic.total} done
              </div>
              <div
                style={{ height: 5, background: "rgba(125,125,125,.2)", borderRadius: 3 }}
                className="mb-1"
              >
                <div
                  style={{
                    height: 5,
                    width: `${progressPct}%`,
                    background: "#50c878",
                    borderRadius: 3,
                  }}
                />
              </div>
              {hasStalled && (
                <div
                  className="badge rounded-pill mt-1"
                  style={{
                    fontSize: "0.6875rem",
                    background: epic.stalled > 1 ? "rgba(220,53,69,.15)" : "rgba(255,193,7,.15)",
                    color: epic.stalled > 1 ? "#dc3545" : "#ffc107",
                    border: `1px solid ${epic.stalled > 1 ? "rgba(220,53,69,.3)" : "rgba(255,193,7,.3)"}`,
                  }}
                >
                  {epic.stalled} stalled
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
