import type { SprintPace, ScopeChange } from "../../../types/teams";

interface Props {
  pace: SprintPace;
  scope: ScopeChange;
  offBoardCount: number;
}

/**
 * Row 1 "Are we on track?" — horizontal strip of compact cards showing sprint
 * health metrics (completion vs time, remaining work, scope change, off-board PRs).
 */
export function OnTrackStrip({ pace, scope, offBoardCount }: Props) {
  const donePctWhole = Math.round(pace.donePct * 100);
  const elapsedPctWhole = Math.round(pace.elapsedPct * 100);
  const isBehind = pace.behindPace;

  return (
    <div className="d-flex gap-2 mb-3">
      {/* 1. Hero: Completion vs Time */}
      <div className="flex-fill border rounded p-2" style={{ minWidth: 0 }}>
        <div className="d-flex align-items-center gap-2 mb-1">
          <span className="fw-semibold" style={{ fontSize: "0.9375rem" }}>
            {donePctWhole}% done · {elapsedPctWhole}% elapsed
          </span>
          <span
            className={`badge ${isBehind ? "text-bg-danger" : "text-bg-success"}`}
            style={{ fontSize: "0.6875rem" }}
          >
            {isBehind ? "Behind pace" : "On track"}
          </span>
        </div>
        <div className="small text-muted mb-2">
          Day {pace.dayOfSprint} of {pace.sprintLength}
        </div>
        {/* Dual mini-bar: done vs elapsed */}
        <div className="d-flex gap-1">
          <div
            className="flex-fill"
            style={{ background: "rgba(125,125,125,.15)", borderRadius: 2, overflow: "hidden" }}
          >
            <div
              style={{
                width: `${donePctWhole}%`,
                height: 4,
                background: "#50c878",
                borderRadius: 2,
              }}
              title={`${donePctWhole}% done`}
            />
          </div>
          <div
            className="flex-fill"
            style={{ background: "rgba(125,125,125,.15)", borderRadius: 2, overflow: "hidden" }}
          >
            <div
              style={{
                width: `${elapsedPctWhole}%`,
                height: 4,
                background: isBehind ? "#dc3545" : "#6e7781",
                borderRadius: 2,
              }}
              title={`${elapsedPctWhole}% elapsed`}
            />
          </div>
        </div>
      </div>

      {/* 2. Remaining */}
      <div className="flex-fill border rounded p-2 text-center" style={{ minWidth: 0 }}>
        <div className="h5 mb-0">
          {pace.remainingCount} <span className="text-muted small">of {pace.totalCount}</span>
        </div>
        <div className="small text-muted">tickets left</div>
      </div>

      {/* 3. Scope change */}
      <div
        className={`flex-fill border rounded p-2 text-center ${scope.addedCount > 0 ? "bg-warning bg-opacity-10" : ""}`}
        style={{ minWidth: 0 }}
      >
        <div className={`h5 mb-0 ${scope.addedCount > 0 ? "text-warning" : "text-muted"}`}>
          +{scope.addedCount}
        </div>
        <div className="small text-muted">added after start</div>
      </div>

      {/* 4. Off-board PRs */}
      <div className="flex-fill border rounded p-2 text-center" style={{ minWidth: 0 }}>
        <div className="h5 mb-0">{offBoardCount}</div>
        <div className="small text-muted">not linked to sprint</div>
      </div>
    </div>
  );
}
