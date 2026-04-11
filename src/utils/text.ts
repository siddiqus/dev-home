import { Note } from "../types";

export function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

/** Format a GitHub URL like https://github.com/org/repo/pull/123 as repo#123 */
export function formatGitHubTitle(url: string): string {
  const match = url.match(/github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/);
  if (match) return `${match[1]}#${match[2]}`;
  const repoMatch = url.match(/github\.com\/[^/]+\/([^/\s]+)/);
  if (repoMatch) return repoMatch[1];
  return url;
}

export function getReferenceUrl(note: Note, jiraBaseUrl: string): string | null {
  if (note.type === "jira_ticket" && note.reference_id) {
    const base = jiraBaseUrl.replace(/\/+$/, "");
    return base ? `${base}/browse/${note.reference_id}` : null;
  }
  if (note.type === "github_pr" && note.reference_id) {
    return note.reference_id;
  }
  return null;
}

export function getNoteDisplayTitle(note: Note): string {
  return (
    note.title ||
    (note.type === "github_pr"
      ? formatGitHubTitle(note.reference_id || "")
      : note.type === "jira_ticket"
        ? note.reference_id || ""
        : "") ||
    "Untitled note"
  );
}
