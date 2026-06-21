# Jira Issues UX Improvements — Design

**Date:** 2026-06-21
**Scope:** Jira issue tables (My Tasks + Issue Search) and their detail view.

## Background

Both Jira tabs — "My Tasks" (`JiraTasks`) and "Issue Search" (`JiraIssueSearch`) —
render their results through a single shared component, `JiraIssueTable`. That table
currently:

- Makes the entire row clickable to open issue details.
- Opens details in the shared fullscreen `DescriptionModal` (also used by PRs, where
  the fullscreen layout with checks/Claude panels is justified).

For Jira, the fullscreen modal is intrusive — descriptions are short, and the modal
hides the list. This work improves the UX of the Jira tables and replaces the modal
with a right-side drawer for Jira issues only.

## Goals

1. Indicate that the Key column value opens an external link (new tab).
2. Add an explicit "Details" action button per row.
3. Replace the fullscreen modal with a right-side drawer that can stay open while the
   list remains visible.

## Non-goals

- No changes to the shared `DescriptionModal` (PRs keep using it as-is).
- No changes to `JiraTasks` or `JiraIssueSearch` — they only render `JiraIssueTable`.

## Changes

### 1. Key column — external link affordance

In `JiraIssueTable`, the Key cell keeps its `<a target="_blank">` to the Jira browse
URL. Add a small `IconExternalLink` (size ~13, muted, `flex-shrink: 0`) inline after
the key text. Wrap key text + icon in an inline-flex container so they stay on one
line.

### 2. Actions column

- Add a trailing header cell with no text and a fixed narrow width.
- Each row renders a small **Details** button: `btn btn-outline-secondary btn-sm`,
  text label "Details". Clicking opens the drawer for that issue. `onClick` calls
  `e.stopPropagation()` (defensive).

### 3. Row interaction

The `<tr>` is no longer whole-row clickable: remove its `onClick` handler and
`cursor: pointer` style. Only the Key link and the Details button are interactive.
This makes opening predictable and avoids accidental opens.

### 4. Side drawer (new `JiraIssueDrawer.tsx`)

New component using react-bootstrap `Offcanvas`:

- `placement="end"` — slides in from the right, full height.
- `backdrop={false}` and `scroll` enabled — the list stays visible and interactive
  while the drawer is open.
- Closes via the close button and `Esc` (Offcanvas default).
- Width: moderate (~420px) — comfortable reading without dominating the screen.

Contents:

- **Header:** `KEY: Summary` title; project name subtitle; an "Open in Jira"
  external link (with `IconExternalLink`). Standard close button.
- **Body:** full-height, scrollable. Description rendered with `ReactMarkdown` +
  `remarkBreaks` (matching the modal). Italic "No description provided." fallback
  when empty.

`JiraIssueTable` swaps `DescriptionModal` for `JiraIssueDrawer`, reusing the existing
`selectedIssue` state and the `baseUrl`-derived browse URL.

## Files touched

- `src/components/JiraIssueTable.tsx` — key icon, actions column, remove row click,
  swap modal → drawer.
- `src/components/JiraIssueDrawer.tsx` — new.
- `src/components/JiraIssueDrawer.css` — new (drawer width / spacing), if needed.

## Testing / verification

- My Tasks tab: Details button opens drawer; key link opens Jira in new tab; row body
  click does nothing; list stays visible/scrollable with drawer open.
- Issue Search tab: same behavior on search results.
- Empty description shows the fallback. `Esc` and close button dismiss the drawer.
