/**
 * Single source of truth for the tab → data-dependency mapping.
 *
 * Each sidebar tab needs a specific set of data sources. This file declares that
 * mapping so the app can lazily load only what the active tab requires, instead
 * of fetching everything up front. Views that self-fetch (e.g. jira-search,
 * org-prs, teams, team-dashboard, claude) declare no sources here.
 *
 * Keys must match the `key` values used in navTabs.ts / App.tsx sidebar metadata.
 */

export type DataSource =
  | "openPRs"
  | "reviewRequests"
  | "jiraIssues"
  | "jiraComments"
  | "githubMentions"
  | "notes"
  | "kanban"
  | "focusState";

/** Sources fetched remotely from GitHub/Jira. The rest are local. */
export const remoteSources: DataSource[] = [
  "openPRs",
  "reviewRequests",
  "jiraIssues",
  "jiraComments",
  "githubMentions",
];

/** Whether a data source is fetched from a remote service (GitHub/Jira). */
export function isRemoteSource(s: DataSource): boolean {
  return remoteSources.includes(s);
}

/**
 * Static tab → sources map. The `summary` tab's optional `kanban` dependency is
 * layered on in `sourcesFor` based on `boardEnabled`, so it is omitted here.
 */
const TAB_SOURCES: Record<string, DataSource[]> = {
  summary: ["openPRs", "reviewRequests", "jiraIssues", "jiraComments", "githubMentions", "notes"],
  focus: [
    "openPRs",
    "reviewRequests",
    "jiraIssues",
    "jiraComments",
    "githubMentions",
    "notes",
    "focusState",
  ],
  board: ["openPRs", "reviewRequests", "notes", "kanban"],
  prs: ["openPRs", "jiraIssues"],
  reviews: ["reviewRequests", "jiraIssues"],
  // githubMentions is derived by merging notification mentions with PR comments
  // (from openPRs) and filtering out review-request dupes (needs reviewRequests),
  // so this tab must load all three for the Comments list to populate.
  "github-mentions": ["githubMentions", "openPRs", "reviewRequests"],
  jira: ["jiraIssues"],
  "jira-mentions": ["jiraComments"],
  notes: ["notes"],
  // Uses whatever is already loaded.
  pomodoro: [],
  // These views self-fetch.
  "jira-search": [],
  "org-prs": [],
  teams: [],
  "team-dashboard": [],
  claude: [],
};

/**
 * Returns the data sources a tab needs. Unknown tab keys return an empty array.
 *
 * `summary` additionally requires `kanban` when `opts.boardEnabled` is true.
 */
export function sourcesFor(tabKey: string, opts: { boardEnabled: boolean }): DataSource[] {
  const base = TAB_SOURCES[tabKey] ?? [];
  if (tabKey === "summary" && opts.boardEnabled) {
    return [...base, "kanban"];
  }
  return base;
}
