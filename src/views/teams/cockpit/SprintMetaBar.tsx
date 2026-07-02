import type { SprintResult, SprintPace } from "../../../types/teams";

interface Props {
  sprint: SprintResult | null;
  pace: SprintPace;
  lastSynced?: string | null;
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

export function SprintMetaBar({ sprint, pace, lastSynced }: Props) {
  if (!sprint) {
    return (
      <div className="border rounded p-2 mb-3 bg-body-secondary">
        <div className="text-muted small">No active sprint</div>
      </div>
    );
  }

  return (
    <div className="border rounded p-2 mb-3 d-flex align-items-center gap-3 flex-wrap">
      <div className="fw-semibold">{sprint.name}</div>

      {sprint.startDate && sprint.endDate && (
        <div className="text-muted small">
          {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)}
        </div>
      )}

      <div className="small">
        Day {pace.dayOfSprint} of {pace.sprintLength}
      </div>

      {sprint.goal && (
        <div className="fst-italic text-muted small" style={{ maxWidth: "300px" }}>
          {sprint.goal}
        </div>
      )}

      {lastSynced && (
        <div className="ms-auto text-muted small">Last synced {formatLastSynced(lastSynced)}</div>
      )}
    </div>
  );
}
