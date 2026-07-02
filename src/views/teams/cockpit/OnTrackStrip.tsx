import type { SprintPace } from "../../../types/teams";

interface Props {
  pace: SprintPace;
}

export function OnTrackStrip({ pace }: Props) {
  const donePctWhole = Math.round(pace.donePct * 100);
  const elapsedPctWhole = Math.round(pace.elapsedPct * 100);
  const isBehind = pace.behindPace;

  return (
    <div className="d-flex gap-2">
      {/* 1. Hero: Completion vs Time */}
      <div className="flex-fill" style={{ minWidth: 160 }}>
        <div className="d-flex align-items-center gap-2 mb-2">
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
      <div
        className="text-center ps-3 d-flex flex-column justify-content-center"
        style={{ borderLeft: "1px solid rgba(125,125,125,.2)", minWidth: 84 }}
      >
        <div className="h5 mb-0">
          {pace.remainingCount} <span className="text-muted small">of {pace.totalCount}</span>
        </div>
        <div className="small text-muted">tickets left</div>
      </div>
    </div>
  );
}
