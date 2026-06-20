# Sidebar Menu Groups — Design

**Date:** 2026-06-20
**Status:** Approved

## Goal

Replace the flat sidebar tab list with labeled, domain-based groups so related
navigation items are visually clustered under section headers.

## Groups

Fixed structure, defined in code. Order is top-to-bottom.

| Group key  | Group label | Tabs (in order)                              |
| ---------- | ----------- | -------------------------------------------- |
| `overview` | Overview    | Summary, Focus, Board, Notes                 |
| `jira`     | JIRA        | JIRA Tasks, Mentions                         |
| `github`   | GitHub      | Pull Requests, Reviews, Org PRs*             |
| `tools`    | Tools       | Pomodoro                                     |
| `ai`       | AI          | Claude*                                      |

\* **Org PRs** renders only when `githubOrg` is set. **Claude** renders only when
`claudeEnabled` is true. These are runtime-conditional and decided in `App.tsx`.

Groups are **not** user-configurable and **not** toggleable. Individual tabs
remain toggleable via Settings → Appearance (existing `hiddenTabs` mechanism).

## Visual Treatment

**Expanded sidebar (200px):**
- Each group renders a small, muted, uppercase label above its tabs.
- Vertical spacing separates groups.

**Collapsed sidebar (48px, icon-only):**
- Group labels are hidden.
- A thin divider line renders between groups to preserve visual grouping.

## Architecture

### 1. `src/config/navTabs.ts` — source of truth for structure

- Add a `NavGroup` interface: `{ key: string; label: string; tabs: NavTab[] }`.
- Export `NAV_GROUPS: NavGroup[]` describing the structure above, including the
  conditional tabs (`org-prs`, `claude`) as ordinary entries. The config holds
  *structure*; runtime visibility stays in `App.tsx`.
- Derive `NAV_TABS` by flattening `NAV_GROUPS` (preserves the existing flat export).
- Keep `TOGGLEABLE_TABS = NAV_TABS.filter(t => t.key !== "summary")` unchanged so
  `MenuItemsToggle` and `hiddenTabs` logic continue to work without modification.

### 2. `App.tsx` — grouped rendering

- Per-tab runtime metadata (icon, live count) stays in `App.tsx`, keyed by tab
  `key` (a lookup map), since counts depend on runtime state
  (`jiraIssues.length`, `openPRs.length`, etc.).
- Replace the flat `[...].filter(notHidden).map(render)` with: iterate
  `NAV_GROUPS` → for each group, compute its visible tabs (not hidden, and
  conditional tabs gated by `githubOrg` / `claudeEnabled`) → if the group has at
  least one visible tab, render the group label + its tabs; otherwise render
  nothing (no empty header).
- Tab button markup, `effectiveTab` active state, `onClick={setActiveTab}`,
  `getShortcutTitle`, and badge rendering are unchanged.

### 3. `src/styles/sidebar.css` — group styles

- Add `.sidebar-group` (flex column, gap), `.sidebar-group-label` (small,
  uppercase, muted, letter-spaced), and `.sidebar-group-divider` (thin top
  border, hidden by default in expanded view).
- Collapsed overrides: `.sidebar.collapsed .sidebar-group-label { display: none }`
  and show `.sidebar-group-divider` between groups.

## Edge Cases

- **Empty group** (all member tabs hidden, or conditional tabs off): group and
  its header are omitted entirely.
- **First group**: no leading divider in collapsed mode.
- **Settings toggles**: continue to hide/show individual tabs; groups react by
  appearing/disappearing when emptied.
- **Keyboard shortcuts / active tab / `effectiveTab`**: unaffected — still keyed
  by tab `key`.

## Testing

No automated test harness currently wraps `App.tsx`; this is a presentational
change. Verify by running the Vite dev server and confirming:

1. Expanded sidebar shows the five group labels with correct tabs under each.
2. Collapsed sidebar shows dividers between groups, no labels.
3. Toggling all of a group's tabs off in Settings removes the group + header.
4. Org PRs / Claude appear only under their runtime conditions, and the GitHub /
   AI groups behave correctly when those tabs are absent.

## Out of Scope (YAGNI)

- Collapsible/expandable groups.
- User-configurable group names, order, or tab assignment.
- Toggling entire groups on/off.
