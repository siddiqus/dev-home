import { JiraIssue } from "../types";

/** Collapse tab/newline/carriage-return runs to a single space so the TSV grid stays intact. */
function clean(value: unknown): string {
  return String(value ?? "").replace(/[\t\n\r]+/g, " ");
}

/** ISO-8601 -> local date only (no time), or "" for empty/invalid input. */
function toLocalDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

const HEADERS = ["key", "summary", "status", "assignee", "created", "updated"];

/**
 * Serialize Jira issues to a tab-separated grid. The first line is the header row;
 * each subsequent line is one issue. Returns just the header row for an empty array
 * (no trailing newline).
 */
export function issuesToTsv(issues: JiraIssue[]): string {
  const rows = [HEADERS.join("\t")];

  for (const issue of issues) {
    rows.push(
      [
        clean(issue.key),
        clean(issue.summary),
        clean(issue.status?.name),
        clean(issue.assignee?.displayName ?? "Unassigned"),
        toLocalDate(issue.created),
        toLocalDate(issue.updated),
      ].join("\t"),
    );
  }

  return rows.join("\n");
}

/** Trigger a browser download of `content` as a file named `filename`. */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/tab-separated-values",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
