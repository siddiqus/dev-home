import { useRef, type KeyboardEvent } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { DashboardIssue, Ref, WorkloadEntry } from "../../../types/teams";
import { MemberDetail } from "./MemberDetail";
import { flagSummary, sortByNeed } from "./memberSignals";
import { StatusBar, StatusLegend } from "./StatusBar";
import { STALLED_CHIP_STYLE } from "./staleTone";

interface Props {
  workload: WorkloadEntry[];
  issues: DashboardIssue[];
  /** The picked member; null (or someone no longer on the team) falls back to the first. */
  selectedId: string | null;
  onSelect: (accountId: string) => void;
  onOpenRef?: (ref: Ref) => void;
}

/** The People tab: the team on the left, in Work Spread order; the picked person on the right. */
export function PeopleView({ workload, issues, selectedId, onSelect, onOpenRef }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  if (workload.length === 0) {
    return <div className="border rounded p-3 text-muted small">No team members</div>;
  }

  const people = sortByNeed(workload);
  const selected = people.find((p) => p.accountId === selectedId) ?? people[0]!;
  const max = Math.max(1, ...workload.map((w) => w.ticketCount));

  // ↑/↓ moves the pick (and focus) along the list, for walking through standup.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = people.indexOf(selected) + (e.key === "ArrowDown" ? 1 : -1);
    const next = people[i];
    if (!next) return;
    onSelect(next.accountId);
    listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[i]?.focus();
  };

  return (
    <div className="people-view">
      <div className="people-view__rail">
        <StatusLegend className="people-view__legend" />
        <div
          ref={listRef}
          role="listbox"
          aria-label="People"
          className="people-view__list"
          onKeyDown={onKeyDown}
        >
          {people.map((w) => {
            const isSelected = w === selected;
            return (
              <button
                key={w.accountId}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                className={`people-view__person${isSelected ? " is-selected" : ""}`}
                onClick={() => onSelect(w.accountId)}
              >
                <span className="people-view__name-row">
                  <span className="people-view__name">{w.displayName}</span>
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
                <span className="people-view__stats">
                  WIP {w.wip} · Done {w.doneCount}
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
          })}
        </div>
      </div>
      <div className="people-view__detail">
        <MemberDetail
          key={selected.accountId}
          member={selected}
          issues={issues}
          onOpenRef={onOpenRef}
        />
      </div>
    </div>
  );
}
