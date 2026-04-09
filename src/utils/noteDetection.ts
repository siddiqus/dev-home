import { NoteType } from "../types";

/** Trim leading/trailing blank lines and whitespace, but preserve internal newlines */
export function trimEnds(s: string): string {
  return s
    .replace(/^\s*\n/, "")
    .replace(/\n\s*$/, "")
    .trim();
}

// Matches a full JIRA URL like https://org.atlassian.net/browse/PROJ-123
const JIRA_URL_PATTERN = /\bhttps?:\/\/[^\s/]+\/browse\/([A-Z][A-Z0-9]+-\d+)\b/;
// Matches a bare JIRA key like PROJ-123
const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;
const GITHUB_PATTERN = /\bhttps?:\/\/github\.com\/[^\s/]+\/[^\s/]+(?:\/pull\/\d+)?\b/;

export function detectNote(text: string): { type: NoteType; referenceId: string; content: string } {
  const lines = text.split("\n");
  const firstLine = lines[0] || "";

  // Try JIRA URL first (full URL match extracts the key, strips entire URL)
  const jiraUrlMatch = JIRA_URL_PATTERN.exec(firstLine);
  // Then try bare JIRA key
  const jiraKeyMatch = !jiraUrlMatch ? JIRA_KEY_PATTERN.exec(firstLine) : null;
  const githubMatch = GITHUB_PATTERN.exec(firstLine);

  // Pick the JIRA match (URL takes priority over bare key)
  const jiraMatch = jiraUrlMatch || jiraKeyMatch;
  const jiraIndex = jiraMatch ? jiraMatch.index : Infinity;
  const githubIndex = githubMatch ? githubMatch.index : Infinity;

  if (jiraMatch && jiraIndex <= githubIndex) {
    const referenceId = jiraMatch[1]; // captured group is the key in both patterns
    const restOfFirstLine = (
      firstLine.slice(0, jiraMatch.index) + firstLine.slice(jiraMatch.index + jiraMatch[0].length)
    ).trim();
    const restOfLines = lines.slice(1).join("\n");
    const content = restOfFirstLine
      ? restOfFirstLine + (restOfLines ? "\n" + restOfLines : "")
      : restOfLines;
    return { type: "jira_ticket", referenceId, content: trimEnds(content) };
  }

  if (githubMatch) {
    const referenceId = githubMatch[0];
    const restOfFirstLine = (
      firstLine.slice(0, githubMatch.index) +
      firstLine.slice(githubMatch.index + githubMatch[0].length)
    ).trim();
    const restOfLines = lines.slice(1).join("\n");
    const content = restOfFirstLine
      ? restOfFirstLine + (restOfLines ? "\n" + restOfLines : "")
      : restOfLines;
    return { type: "github_pr", referenceId, content: trimEnds(content) };
  }

  return { type: "free_text", referenceId: "", content: trimEnds(text) };
}
