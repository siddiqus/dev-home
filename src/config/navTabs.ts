/**
 * Shared definition of the sidebar tabs and their groups.
 *
 * NAV_GROUPS is the source of truth for sidebar structure (order + grouping).
 * NAV_TABS is the flattened list, used by Settings → Appearance to decide which
 * tabs can be toggled on/off. The conditional tabs (org-prs, claude) are listed
 * here for structure; their runtime visibility (githubOrg, claudeEnabled) is
 * still decided in App.tsx.
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
    key: "jira",
    label: "JIRA",
    tabs: [
      { key: "jira", label: "JIRA Tasks" },
      { key: "jira-mentions", label: "Mentions" },
    ],
  },
  {
    key: "github",
    label: "GitHub",
    tabs: [
      { key: "prs", label: "Pull Requests" },
      { key: "reviews", label: "Reviews" },
      { key: "github-mentions", label: "Comments" },
      { key: "org-prs", label: "Org PRs" },
    ],
  },
  {
    key: "teams",
    label: "Teams",
    tabs: [
      { key: "teams", label: "Manage Teams" },
      { key: "team-dashboard", label: "Team Dashboard" },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    tabs: [{ key: "pomodoro", label: "Pomodoro" }],
  },
  {
    key: "ai",
    label: "AI",
    tabs: [{ key: "claude", label: "Claude" }],
  },
];

/** Flattened list of all tabs, in sidebar order. */
export const NAV_TABS: NavTab[] = NAV_GROUPS.flatMap((g) => g.tabs);

/** Tabs the user is allowed to hide. Summary is always shown as a landing tab. */
export const TOGGLEABLE_TABS: NavTab[] = NAV_TABS.filter((t) => t.key !== "summary");
