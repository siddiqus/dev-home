import type { SprintPace } from "../../../types/teams";

interface Props {
  pace: SprintPace;
}

/** Done vs elapsed, pace badge and tickets left: the pace half of the sprint strip. */
export function OnTrackStrip({ pace }: Props) {
  const donePctWhole = Math.round(pace.donePct * 100);
  const elapsedPctWhole = Math.round(pace.elapsedPct * 100);
  const isBehind = pace.behindPace;

  return (
    <>
      <span className="sprint-strip__meter">
        {donePctWhole}% done
        <span className="sprint-strip__track">
          <span
            className="sprint-strip__fill sprint-strip__fill--done"
            style={{ width: `${donePctWhole}%` }}
          />
        </span>
      </span>
      <span className="sprint-strip__meter">
        {elapsedPctWhole}% elapsed
        <span className="sprint-strip__track">
          <span
            className={`sprint-strip__fill ${isBehind ? "sprint-strip__fill--behind" : "sprint-strip__fill--elapsed"}`}
            style={{ width: `${elapsedPctWhole}%` }}
          />
        </span>
      </span>
      <span
        className={`badge ${isBehind ? "text-bg-danger" : "text-bg-success"}`}
        style={{ fontSize: "0.6875rem" }}
      >
        {isBehind ? "Behind pace" : "On track"}
      </span>
      <span className="sprint-strip__divider" aria-hidden="true" />
      <span>
        <span className="fw-semibold">{pace.remainingCount}</span>{" "}
        <span className="text-muted">of {pace.totalCount} tickets left</span>
      </span>
    </>
  );
}
