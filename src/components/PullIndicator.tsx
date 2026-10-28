import { IconRefresh } from "@tabler/icons-react";
import { PULL_THRESHOLD, type PullPhase } from "../hooks/usePullToRefresh";
import "./PullIndicator.css";

/**
 * The pull-to-refresh circle: drops out from under the top bar with the
 * finger, its arrow turning as it goes, then spins in place while the page
 * refetches. Floats over the page, so nothing under it moves.
 */
export function PullIndicator({ pull, phase }: { pull: number; phase: PullPhase }) {
  const spinning = phase === "refreshing";
  const armed = spinning || pull >= PULL_THRESHOLD;
  return (
    <div
      className={[
        "pull-indicator",
        phase === "pulling" && "pull-indicator--dragging",
        armed && "pull-indicator--armed",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        transform: `translate(-50%, ${spinning ? PULL_THRESHOLD : pull}px)`,
        opacity: spinning ? 1 : Math.min(1, pull / PULL_THRESHOLD),
      }}
      role="status"
    >
      <IconRefresh
        size={18}
        aria-hidden="true"
        className={spinning ? "pull-indicator-icon spinning" : "pull-indicator-icon"}
        style={spinning ? undefined : { transform: `rotate(${pull * 4}deg)` }}
      />
      {spinning && <span className="visually-hidden">Refreshing</span>}
    </div>
  );
}
