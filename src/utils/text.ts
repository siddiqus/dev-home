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
  if (!note.reference_id) return null;

  if (note.type === "jira_ticket") {
    // reference_id is either a full URL or a bare key like PROJ-123
    if (/^https?:\/\//.test(note.reference_id)) {
      return note.reference_id;
    }
    const base = jiraBaseUrl.replace(/\/+$/, "");
    return base ? `${base}/browse/${note.reference_id}` : null;
  }

  if (note.type === "github_pr" || note.type === "link") {
    return note.reference_id;
  }

  return null;
}

export function getNoteDisplayTitle(note: Note): string {
  if (note.title) return note.title;

  if (note.type === "github_pr") {
    return formatGitHubTitle(note.reference_id || "") || deriveTitleFromContent(note.content);
  }
  if (note.type === "jira_ticket") {
    const keyMatch = note.reference_id?.match(/([A-Z][A-Z0-9]+-\d+)/);
    return keyMatch ? keyMatch[1] : note.reference_id || deriveTitleFromContent(note.content);
  }
  if (note.type === "link") {
    return note.reference_id || deriveTitleFromContent(note.content);
  }

  return deriveTitleFromContent(note.content);
}

export function deriveTitleFromContent(content: string | undefined, maxLength = 80): string {
  if (!content) return "Untitled note";

  let firstLine = "";
  let start = 0;
  while (start < content.length) {
    let nl = content.indexOf("\n", start);
    if (nl === -1) nl = content.length;
    if (content.slice(start, nl).trim()) {
      firstLine = content.slice(start, nl);
      break;
    }
    start = nl + 1;
  }

  const plain = firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/[*_~`]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
  if (!plain) return "Untitled note";
  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength).trimEnd() + "...";
}
