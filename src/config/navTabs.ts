/**
 * Shared definition of the static sidebar tabs.
 *
 * This is the source of truth for which tabs can be toggled on/off from
 * Settings → Appearance. The sidebar itself (App.tsx) also renders conditional
 * tabs (org-prs, claude) that depend on runtime config — those are intentionally
 * not toggleable here and stay in App.tsx.
 *
 * Keys must match the `key` values used in App.tsx's sidebar tab list.
 */
export interface NavTab {
  key: string;
  label: string;
}

export const NAV_TABS: NavTab[] = [
  { key: "summary", label: "Summary" },
  { key: "focus", label: "Focus" },
  { key: "board", label: "Board" },
  { key: "notes", label: "Notes" },
  { key: "jira", label: "JIRA Tasks" },
  { key: "mentions", label: "Mentions" },
  { key: "prs", label: "Pull Requests" },
  { key: "reviews", label: "Reviews" },
  { key: "pomodoro", label: "Pomodoro" },
];

/** Tabs the user is allowed to hide. Summary is always shown as a landing tab. */
export const TOGGLEABLE_TABS: NavTab[] = NAV_TABS.filter((t) => t.key !== "summary");
