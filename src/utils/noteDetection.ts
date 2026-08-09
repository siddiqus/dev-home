import { NoteType } from "../types";

// Matches a full JIRA URL like https://org.atlassian.net/browse/PROJ-123 (with optional query/fragment)
const JIRA_URL_PATTERN = /\bhttps?:\/\/[^\s/]+\/browse\/([A-Z][A-Z0-9]+-\d+)\b[^\s)>]*/;
// Matches a GitHub URL (repo or PR, with optional query/fragment)
const GITHUB_PATTERN = /\bhttps?:\/\/github\.com\/[^\s/]+\/[^\s/]+(?:\/pull\/\d+)?\b[^\s)>]*/;
// Matches any generic URL
const GENERIC_URL_PATTERN = /\bhttps?:\/\/[^\s)>]+/;
// Same, global — used to blank out URLs before scanning for a bare key so that a
// ticket-shaped fragment buried in a URL is never mistaken for a real key.
const URL_STRIP_PATTERN = /\bhttps?:\/\/[^\s)>]+/g;

// Matches a bare JIRA key (e.g. PROJ-123) that stands on its own as a whole token.
// Unlike the shared TICKET_KEY_REGEX — which uses `\b` so it can pull a key out of a
// hyphenated branch name like `feature/PROJ-123-add-sso` — this treats `-` (and any
// word char) as a token boundary. That keeps an embedded fragment such as the
// `min-30000` inside a pasted booking URL (`...price%3DBDT-min-30000-1%3B...`) from
// being picked up as a ticket: only a standalone key counts.
const BARE_JIRA_KEY_PATTERN = /(?<![\w-])([A-Za-z][A-Za-z0-9]+-\d+)(?![\w-])/;

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

  // Check for a bare JIRA key (e.g. PROJ-123) as a standalone token, ignoring
  // anything inside a URL so a pasted link is never misread as a ticket.
  const jiraKeyMatch = BARE_JIRA_KEY_PATTERN.exec(text.replace(URL_STRIP_PATTERN, " "));
  if (jiraKeyMatch) {
    return { type: "jira_ticket", referenceId: jiraKeyMatch[1].toUpperCase(), content: text };
  }

  // Check for any other URL
  const urlMatch = GENERIC_URL_PATTERN.exec(text);
  if (urlMatch) {
    return { type: "link", referenceId: urlMatch[0], content: text };
  }

  return { type: "free_text", referenceId: "", content: text };
}
