/**
 * Single source of truth for the tab → data-dependency mapping.
 *
 * Each sidebar tab needs a specific set of data sources. This file declares that
 * mapping so the app can lazily load only what the active tab requires, instead
 * of fetching everything up front. Views that self-fetch (e.g. jira-search,
 * org-prs, teams, team-dashboard) declare no sources here.
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
};

/**
 * Tabs with a top-bar refresh button, mapped to the source(s) the page owns.
 * Unlike TAB_SOURCES, this omits enrichment-only deps (e.g. jiraIssues on My
 * PRs) so a page refresh stays scoped. Aggregate tabs (summary/focus/board) use
 * the sidebar Refresh; self-fetching tabs (org-prs, teams, jira-search) have
 * their own in-page refresh controls.
 */
export const PAGE_REFRESH: Record<string, { sources: DataSource[]; label: string }> = {
  prs: { sources: ["openPRs"], label: "Refresh my PRs" },
  reviews: { sources: ["reviewRequests"], label: "Refresh reviews" },
  // PR comments come from openPRs, merged with notification mentions.
  "github-mentions": { sources: ["githubMentions", "openPRs"], label: "Refresh comments" },
  jira: { sources: ["jiraIssues"], label: "Refresh my issues" },
  "jira-mentions": { sources: ["jiraComments"], label: "Refresh mentions" },
  notes: { sources: ["notes"], label: "Refresh notes" },
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
