import type { ReactNode } from "react";
import type { SprintResult, SprintPace } from "../../../types/teams";
import { OnTrackStrip } from "./OnTrackStrip";

interface Props {
  sprint: SprintResult | null;
  pace: SprintPace;
  /** Leads the strip, left of the facts (the dashboard's overview/people switch). */
  children?: ReactNode;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The sprint on the team's Jira board, or null when any part is unknown. */
export function sprintBoardUrl(
  jiraBaseUrl: string | undefined,
  boardId: number | null,
  sprintId: number | null,
): string | null {
  if (!jiraBaseUrl || boardId == null || sprintId == null) return null;
  return `${jiraBaseUrl.replace(/\/+$/, "")}/secure/RapidBoard.jspa?rapidView=${boardId}&view=detail&selectedSprint=${sprintId}`;
}

/**
 * One line under the toolbar, no box: whatever leads it (the view switch), the
 * sprint's facts in the middle (day, dates, tickets), its progress and pace on
 * the right. The sprint name lives in the picker above, and the goal in the
 * facts' tooltip.
 */
export function SprintMetaBar({ sprint, pace, children }: Props) {
  if (!sprint) {
    return (
      // The toolbar says "No active sprint", by the team picker.
      <div className="sprint-strip mb-3">{children}</div>
    );
  }

  return (
    <div className="sprint-strip mb-3">
      {children}
      <span className="sprint-strip__half" title={sprint.goal ? `Goal: ${sprint.goal}` : undefined}>
        <span className="fw-semibold">
          Day {pace.dayOfSprint} of {pace.sprintLength}
        </span>
        {sprint.startDate && sprint.endDate && (
          <>
            <span className="sprint-strip__divider" aria-hidden="true" />
            <span className="text-muted">
              {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)}
            </span>
          </>
        )}
        <span className="sprint-strip__divider" aria-hidden="true" />
        <span title={`${pace.remainingCount} left`}>
          <span className="fw-semibold">{pace.totalCount}</span>{" "}
          <span className="text-muted">tickets in the sprint</span>
        </span>
      </span>
      <OnTrackStrip pace={pace} />
    </div>
  );
}
