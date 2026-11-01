import { IconAlertTriangle } from "@tabler/icons-react";
import type { WorkloadEntry } from "../../../types/teams";
import { flagSummary } from "./memberSignals";
import { StatusBar } from "./StatusBar";
import { STALLED_CHIP_STYLE } from "./staleTone";

interface Props {
  member: WorkloadEntry;
  /** The team's biggest load, so bars compare people. */
  max: number;
  onClick: () => void;
  /** Set in the People list, where the row is a listbox option; left out in Work Spread. */
  selected?: boolean;
}

/** One person in Work Spread and the People list: name, status bar, then the numbers. */
export function PersonRow({ member: w, max, onClick, selected }: Props) {
  const isOption = selected !== undefined;
  return (
    <button
      type="button"
      className={`person-row${selected ? " is-selected" : ""}`}
      onClick={onClick}
      {...(isOption && { role: "option", "aria-selected": selected, tabIndex: selected ? 0 : -1 })}
    >
      <span className="person-row__top">
        <span className="person-row__name">{w.displayName}</span>
        {/* Just a nudge to check in; the People tab says which tickets and why.
            No label beside a name on a shared standup screen. */}
        {w.atRiskIssues.length > 0 && (
          <span
            className="work-spread-flag"
            title={`Check in: ${flagSummary(w.atRiskIssues)}`}
            aria-label={`Check in: ${flagSummary(w.atRiskIssues)}`}
          >
            <IconAlertTriangle size={14} />
          </span>
        )}
      </span>
      <StatusBar byStatus={w.byStatus} max={max} height={6} />
      <span className="person-row__stats">
        WIP {w.wip} · Done {w.doneCount} ·{" "}
        <span title={`${w.prOpen} open, ${w.prMerged} merged`}>
          PRs {w.prOpen}/{w.prMerged}
        </span>
        {w.stalledCount > 0 && (
          <span
            className="badge rounded-pill"
            style={{ fontSize: "0.6875rem", ...STALLED_CHIP_STYLE }}
          >
            {w.stalledCount} stalled
          </span>
        )}
      </span>
    </button>
  );
}
