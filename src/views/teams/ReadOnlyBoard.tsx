import type { DashboardIssue } from "../../types/teams";

const COLUMNS: { key: string; title: string }[] = [
  { key: "new", title: "To Do" },
  { key: "indeterminate", title: "In Progress" },
  { key: "done", title: "Done" },
];

interface Props {
  issues: DashboardIssue[];
  jiraBaseUrl?: string;
  /** Open the Jira drawer for an issue key. */
  onIssueClick?: (key: string) => void;
  /** Open the PR description modal for a linked PR. */
  onPRClick?: (repoFullName: string, number: number) => void;
}

export function ReadOnlyBoard({ issues, jiraBaseUrl, onIssueClick, onPRClick }: Props) {
  const base = jiraBaseUrl?.replace(/\/+$/, "");
  return (
    <div className="d-flex gap-2">
      {COLUMNS.map((c) => {
        const colIssues = issues.filter((i) => i.statusCategory === c.key);
        return (
          <div key={c.key} className="flex-fill border rounded p-2" style={{ minWidth: 0 }}>
            <div className="small text-muted mb-2">
              {c.title.toUpperCase()} · {colIssues.length}
            </div>
            {colIssues.map((i) => (
              <div
                key={i.key}
                className="card p-2 mb-2"
                style={{ fontSize: "0.75rem", cursor: onIssueClick ? "pointer" : undefined }}
                onClick={onIssueClick ? () => onIssueClick(i.key) : undefined}
              >
                <div className="d-flex align-items-center gap-1">
                  {/* Key links out to Jira in a new tab; clicking elsewhere on
                      the card opens the drawer. */}
                  {base ? (
                    <a
                      href={`${base}/browse/${i.key}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {i.key}
                    </a>
                  ) : (
                    <span>{i.key}</span>
                  )}
                  {i.linkedPRs.length > 0 &&
                    (onPRClick ? (
                      <button
                        type="button"
                        className="btn btn-link p-0 align-baseline"
                        style={{ fontSize: "inherit", textDecoration: "none" }}
                        title={`View PR #${i.linkedPRs[0].number}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPRClick(i.linkedPRs[0].repo_full_name, i.linkedPRs[0].number);
                        }}
                      >
                        🔀
                      </button>
                    ) : (
                      <span title="has linked PR">🔀</span>
                    ))}
                </div>
                <div className="text-truncate">{i.summary}</div>
                <div className="text-muted">{i.assigneeName || "Unassigned"}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
