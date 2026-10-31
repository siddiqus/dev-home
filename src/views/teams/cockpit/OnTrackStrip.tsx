import type { SprintPace } from "../../../types/teams";

interface Props {
  pace: SprintPace;
}

/** Done vs time elapsed, in words, then the pace pill: the right half of the sprint strip. */
export function OnTrackStrip({ pace }: Props) {
  const isBehind = pace.behindPace;

  return (
    <span className="sprint-strip__half">
      <span>
        <span className="fw-semibold">{Math.round(pace.donePct * 100)}%</span>{" "}
        <span className="text-muted">done</span>
      </span>
      <span className="sprint-strip__divider" aria-hidden="true" />
      <span>
        <span className="fw-semibold">{Math.round(pace.elapsedPct * 100)}%</span>{" "}
        <span className="text-muted">time elapsed</span>
      </span>
      <span className={`sprint-strip__pace sprint-strip__pace--${isBehind ? "behind" : "ok"}`}>
        {isBehind ? "Behind pace" : "On track"}
      </span>
    </span>
  );
}
