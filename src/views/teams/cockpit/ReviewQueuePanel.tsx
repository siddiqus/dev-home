import { formatRelativeTime } from "../../../utils/time";
import type { ReviewQueueEntry } from "../../../types/teams";

interface Props {
  entries: ReviewQueueEntry[];
  onOpenPR?: (repoFullName: string, number: number) => void;
}

const STATE_META: Record<
  ReviewQueueEntry["state"],
  { dot: string; label: string; className: string }
> = {
  author: { dot: "🔵", label: "Author", className: "text-primary" },
  reviewer: { dot: "🟡", label: "Reviewer", className: "text-warning" },
  none: { dot: "🔴", label: "No reviewer", className: "text-danger" },
};

export function ReviewQueuePanel({ entries, onOpenPR }: Props) {
  return (
    <div className="border rounded p-2">
      <div className="small text-muted mb-2">REVIEW QUEUE · {entries.length}</div>
      {entries.length === 0 ? (
        <div className="text-muted small">No open PRs.</div>
      ) : (
        <table className="table table-sm table-hover mb-0">
          <thead>
            <tr className="small text-muted">
              <th>State</th>
              <th>PR</th>
              <th>Author</th>
              <th>Reviewers</th>
              <th>Checks</th>
              <th className="text-nowrap">Age / Activity</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const meta = STATE_META[e.state];
              return (
                <tr
                  key={`${e.repo_full_name}#${e.number}`}
                  onClick={onOpenPR ? () => onOpenPR(e.repo_full_name, e.number) : undefined}
                  style={onOpenPR ? { cursor: "pointer" } : undefined}
                >
                  <td className={`${meta.className} text-nowrap`}>
                    {meta.dot} <span className="small">{meta.label}</span>
                  </td>
                  <td>
                    <a
                      href={e.html_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      #{e.number} {e.title}
                    </a>
                    <div className="small text-muted">{e.reason}</div>
                  </td>
                  <td className="small text-muted text-nowrap">{e.author}</td>
                  <td className="small text-muted">
                    {e.reviewers.length > 0 ? e.reviewers.join(", ") : "—"}
                  </td>
                  <td className="small text-nowrap">
                    {e.checks_status === "FAILURE" ? (
                      <span className="text-danger">✗</span>
                    ) : e.checks_status === "SUCCESS" ? (
                      <span className="text-success">✓</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="small text-muted text-nowrap">
                    {e.createdAt ? formatRelativeTime(e.createdAt) : "—"} /{" "}
                    {e.updatedAt ? formatRelativeTime(e.updatedAt) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
