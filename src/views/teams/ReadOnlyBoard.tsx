import type { DashboardIssue } from "../../types/teams";

const COLUMNS: { key: string; title: string }[] = [
  { key: "new", title: "To Do" },
  { key: "indeterminate", title: "In Progress" },
  { key: "done", title: "Done" },
];

interface Props {
  issues: DashboardIssue[];
  jiraBaseUrl?: string;
}

export function ReadOnlyBoard({ issues, jiraBaseUrl }: Props) {
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
              <div key={i.key} className="card p-2 mb-2" style={{ fontSize: "0.75rem" }}>
                <div>
                  {base ? (
                    <a href={`${base}/browse/${i.key}`} target="_blank" rel="noreferrer">
                      {i.key}
                    </a>
                  ) : (
                    i.key
                  )}{" "}
                  {i.linkedPRs.length > 0 && <span title="has linked PR">🔀</span>}
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
