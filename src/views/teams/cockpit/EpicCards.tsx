import type { DashboardEpic, Ref } from "../../../types/teams";

interface Props {
  epics: DashboardEpic[];
  onOpenRef?: (ref: Ref) => void;
}

/** Jira's purple epic badge; the No epic bucket gets a dashed, grey one. */
function EpicIcon({ none }: { none: boolean }) {
  return (
    <svg
      className="epic-card__icon"
      viewBox="0 0 16 16"
      role={none ? undefined : "img"}
      aria-label={none ? undefined : "Epic"}
      aria-hidden={none || undefined}
    >
      {none ? (
        <rect
          x=".5"
          y=".5"
          width="15"
          height="15"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeDasharray="2.2 1.8"
        />
      ) : (
        <rect width="16" height="16" rx="3" fill="#904ee2" />
      )}
      <path d="M9.2 2.6 4.6 9h3.1l-.9 4.4L11.4 7H8.3z" fill={none ? "currentColor" : "#fff"} />
    </svg>
  );
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
    <div className="epic-cards">
      {epics.map((epic) => {
        const isNoEpic = epic.key === null;
        const progressPct = epic.total > 0 ? (epic.done / epic.total) * 100 : 0;
        const hasStalled = epic.stalled > 0;

        return (
          <div
            key={epic.key ?? "none"}
            className={`epic-card${isNoEpic ? " epic-card--none" : ""}`}
            onClick={epic.key ? () => onOpenRef?.({ kind: "issue", key: epic.key! }) : undefined}
            title={epic.key ? `View ${epic.key}` : "Synthetic bucket for tickets without an epic"}
          >
            <div className="epic-card__head">
              <EpicIcon none={isNoEpic} />
              <span className="epic-card__name">{epic.name}</span>
            </div>
            {/* No epic keeps the empty line, so its count and bar line up with the rest. */}
            <div className="epic-card__key">{epic.key ?? "\u00a0"}</div>
            {/* One line, so the stalled chip never drops below the count. */}
            <div className="epic-card__meta">
              <span>
                {epic.done}/{epic.total} done
              </span>
              {hasStalled && (
                <span
                  className="badge rounded-pill"
                  style={{
                    fontSize: "0.6875rem",
                    background: epic.stalled > 1 ? "rgba(220,53,69,.15)" : "rgba(255,193,7,.15)",
                    color: epic.stalled > 1 ? "#dc3545" : "#ffc107",
                    border: `1px solid ${epic.stalled > 1 ? "rgba(220,53,69,.3)" : "rgba(255,193,7,.3)"}`,
                  }}
                >
                  {epic.stalled} stalled
                </span>
              )}
            </div>
            <div style={{ height: 5, background: "rgba(125,125,125,.2)", borderRadius: 3 }}>
              <div
                style={{
                  height: 5,
                  width: `${progressPct}%`,
                  background: "#50c878",
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
