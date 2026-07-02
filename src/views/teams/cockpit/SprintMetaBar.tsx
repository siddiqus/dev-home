import type { ReactNode } from "react";
import { IconExternalLink } from "@tabler/icons-react";
import type { SprintResult, SprintPace } from "../../../types/teams";
import { OnTrackStrip } from "./OnTrackStrip";

interface Props {
  sprint: SprintResult | null;
  pace: SprintPace;
  lastSynced?: string | null;
  jiraBaseUrl?: string;
  boardId?: number | null;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatLastSynced(iso: string): string {
  const now = new Date();
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffHr === 1) return "1 hour ago";
  if (diffHr < 24) return `${diffHr} hours ago`;
  return formatShortDate(iso);
}

export function SprintMetaBar({ sprint, pace, lastSynced, jiraBaseUrl, boardId }: Props) {
  if (!sprint) {
    return (
      <div className="border rounded p-2 mb-3 bg-body-secondary">
        <div className="text-muted small">No active sprint</div>
      </div>
    );
  }

  const boardUrl =
    jiraBaseUrl && boardId != null
      ? `${jiraBaseUrl.replace(/\/+$/, "")}/secure/RapidBoard.jspa?rapidView=${boardId}&view=detail&selectedSprint=${sprint.id}`
      : null;

  // Second line — only render the parts we actually have, separated by dots.
  const metaParts: ReactNode[] = [];
  if (sprint.startDate && sprint.endDate) {
    metaParts.push(
      <span key="dates">
        {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)}
      </span>,
    );
  }
  metaParts.push(
    <span key="day">
      Day {pace.dayOfSprint} of {pace.sprintLength}
    </span>,
  );
  if (sprint.goal) {
    metaParts.push(
      <span
        key="goal"
        className="fst-italic text-truncate"
        style={{ maxWidth: 240 }}
        title={sprint.goal}
      >
        {sprint.goal}
      </span>,
    );
  }
  if (lastSynced) {
    metaParts.push(<span key="synced">Synced {formatLastSynced(lastSynced)}</span>);
  }

  return (
    <div className="border rounded p-2 mb-3 d-flex justify-content-between align-items-center gap-3 flex-wrap">
      {/* Left — sprint identity */}
      <div className="d-flex flex-column gap-1" style={{ minWidth: 0 }}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="fw-semibold text-truncate" style={{ maxWidth: 260 }}>
            {sprint.name}
          </span>
          {boardUrl && (
            <a
              href={boardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="d-inline-flex align-items-center gap-1 small"
            >
              Open in JIRA
              <IconExternalLink size={13} stroke={1.5} style={{ opacity: 0.6 }} />
            </a>
          )}
        </div>

        <div className="d-flex align-items-center gap-2 small text-muted flex-wrap">
          {metaParts.map((part, i) => (
            <span key={i} className="d-flex align-items-center gap-2">
              {i > 0 && <span aria-hidden="true">·</span>}
              {part}
            </span>
          ))}
        </div>
      </div>

      {/* Right — on-track strip */}
      <OnTrackStrip pace={pace} />
    </div>
  );
}
