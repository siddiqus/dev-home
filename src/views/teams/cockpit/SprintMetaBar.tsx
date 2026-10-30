import type { SprintResult, SprintPace } from "../../../types/teams";
import { OnTrackStrip } from "./OnTrackStrip";

interface Props {
  sprint: SprintResult | null;
  pace: SprintPace;
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
 * One line under the toolbar: where we are in the sprint, then pace. The sprint
 * name lives in the picker above, and the goal in the tooltip.
 */
export function SprintMetaBar({ sprint, pace }: Props) {
  if (!sprint) {
    return (
      <div className="sprint-strip mb-3">
        <span className="text-muted">No active sprint</span>
      </div>
    );
  }

  return (
    <div className="sprint-strip mb-3" title={sprint.goal ? `Goal: ${sprint.goal}` : undefined}>
      <span>
        <span className="fw-semibold">
          Day {pace.dayOfSprint} of {pace.sprintLength}
        </span>
        {sprint.startDate && sprint.endDate && (
          <span className="text-muted">
            {" "}
            · {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)}
          </span>
        )}
      </span>
      <span className="sprint-strip__divider" aria-hidden="true" />
      <OnTrackStrip pace={pace} />
    </div>
  );
}
