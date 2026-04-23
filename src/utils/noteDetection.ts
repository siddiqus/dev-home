import { NoteType } from "../types";

// Matches a full JIRA URL like https://org.atlassian.net/browse/PROJ-123 (with optional query/fragment)
const JIRA_URL_PATTERN = /\bhttps?:\/\/[^\s/]+\/browse\/([A-Z][A-Z0-9]+-\d+)\b[^\s)>]*/;
// Matches a bare JIRA key like PROJ-123
const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;
// Matches a GitHub URL (repo or PR, with optional query/fragment)
const GITHUB_PATTERN = /\bhttps?:\/\/github\.com\/[^\s/]+\/[^\s/]+(?:\/pull\/\d+)?\b[^\s)>]*/;
// Matches any generic URL
const GENERIC_URL_PATTERN = /\bhttps?:\/\/[^\s)>]+/;

export function detectNote(text: string): { type: NoteType; referenceId: string; content: string } {
  // Check for GitHub URL anywhere in the text
  const githubMatch = GITHUB_PATTERN.exec(text);
  if (githubMatch) {
    return { type: "github_pr", referenceId: githubMatch[0], content: text };
  }

  // Check for full JIRA URL anywhere in the text
  const jiraUrlMatch = JIRA_URL_PATTERN.exec(text);
  if (jiraUrlMatch) {
    return { type: "jira_ticket", referenceId: jiraUrlMatch[0], content: text };
  }

  // Check for bare JIRA key (e.g. PROJ-123)
  const jiraKeyMatch = JIRA_KEY_PATTERN.exec(text);
  if (jiraKeyMatch) {
    return { type: "jira_ticket", referenceId: jiraKeyMatch[1], content: text };
  }

  // Check for any other URL
  const urlMatch = GENERIC_URL_PATTERN.exec(text);
  if (urlMatch) {
    return { type: "link", referenceId: urlMatch[0], content: text };
  }

  return { type: "free_text", referenceId: "", content: text };
}
