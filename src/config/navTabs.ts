/**
 * Shared definition of the sidebar tabs and their groups.
 *
 * NAV_GROUPS is the source of truth for sidebar structure (order + grouping).
 * TOGGLEABLE_GROUPS mirrors that structure for Settings → Appearance, minus the
 * tabs that can't be toggled off. The conditional tabs (org-prs, teams) are
 * listed here for structure; their runtime visibility is decided by
 * isTabVisible.
 *
 * Keys must match the `key` values used in App.tsx's sidebar tab metadata.
 */
export interface NavTab {
  key: string;
  label: string;
}

export interface NavGroup {
  key: string;
  /** Optional section header. A group with no label renders flat (no header). */
  label?: string;
  tabs: NavTab[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "general",
    tabs: [
      { key: "summary", label: "Summary" },
      { key: "focus", label: "Focus" },
      { key: "board", label: "Board" },
      { key: "notes", label: "Notes" },
    ],
  },
  {
    key: "github",
    label: "GitHub",
    tabs: [
      { key: "prs", label: "My PRs" },
      { key: "reviews", label: "Reviews" },
      { key: "github-mentions", label: "Comments" },
      { key: "org-prs", label: "Org PRs" },
    ],
  },
  {
    key: "jira",
    label: "JIRA",
    tabs: [
      { key: "jira", label: "My Issues" },
      { key: "jira-search", label: "Issue Search" },
      { key: "jira-mentions", label: "Mentions" },
    ],
  },
  {
    key: "teams",
    label: "Teams",
    tabs: [
      { key: "teams", label: "Manage Teams" },
      // { key: "team-dashboard", label: "Team Dashboard" },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    tabs: [{ key: "pomodoro", label: "Pomodoro" }],
  },
];

/** Flattened list of all tabs, in sidebar order. */
export const NAV_TABS: NavTab[] = NAV_GROUPS.flatMap((g) => g.tabs);

/**
 * Sidebar groups restricted to the tabs the user is allowed to hide, so the
 * settings toggle list mirrors the sidebar's sections. Summary is always shown
 * as a landing tab.
 */
export const TOGGLEABLE_GROUPS: NavGroup[] = NAV_GROUPS.map((g) => ({
  ...g,
  tabs: g.tabs.filter((t) => t.key !== "summary"),
})).filter((g) => g.tabs.length > 0);

/** Routable tabs that aren't sidebar entries. */
const EXTRA_TABS = new Set(["team-dashboard", "settings"]);
/** Tabs that only make sense with a GitHub org configured. */
const ORG_TABS = new Set(["org-prs", "teams", "team-dashboard"]);

/**
 * Whether a tab key can be shown: it must exist, not be hidden in settings, and
 * have its config prerequisites. Shared by the sidebar and the active-tab
 * fallback, so a saved or shortcut-selected tab can't land on a missing page.
 */
export function isTabVisible(
  key: string,
  ctx: { hiddenTabs: readonly string[]; githubOrg: string },
): boolean {
  if (key === "settings") return true;
  if (!EXTRA_TABS.has(key) && !NAV_TABS.some((t) => t.key === key)) return false;
  if (ctx.hiddenTabs.includes(key)) return false;
  if (ORG_TABS.has(key)) return !!ctx.githubOrg;
  return true;
}
