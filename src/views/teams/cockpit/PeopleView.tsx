import { useRef, type KeyboardEvent } from "react";
import type { AuthoredPR, DashboardIssue, Ref, WorkloadEntry } from "../../../types/teams";
import { MemberDetail } from "./MemberDetail";
import { sortByNeed } from "./memberSignals";
import { PersonRow } from "./PersonRow";
import { StatusLegend } from "./StatusBar";

interface Props {
  workload: WorkloadEntry[];
  issues: DashboardIssue[];
  prs: AuthoredPR[];
  /** The picked member; null (or someone no longer on the team) falls back to the first. */
  selectedId: string | null;
  onSelect: (accountId: string) => void;
  onOpenRef?: (ref: Ref) => void;
}

/** The People tab: the team on the left, in Work Spread order; the picked person on the right. */
export function PeopleView({ workload, issues, prs, selectedId, onSelect, onOpenRef }: Props) {
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
          {people.map((w) => (
            <PersonRow
              key={w.accountId}
              member={w}
              max={max}
              selected={w === selected}
              onClick={() => onSelect(w.accountId)}
            />
          ))}
        </div>
      </div>
      <div className="people-view__detail">
        <MemberDetail
          key={selected.accountId}
          member={selected}
          issues={issues}
          prs={prs}
          onOpenRef={onOpenRef}
        />
      </div>
    </div>
  );
}
