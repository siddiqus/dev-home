# Toggle Jira Groups On/Off — My PRs

**Date:** 2026-07-30
**Status:** Approved (design)

## Problem

The "My PRs" list always clusters pull requests by Jira ticket. In both the
**segments** view (Ready / Needs action / Pending / Drafts) and the **flat**
view, PRs that share a ticket key collapse into a cluster with a header. There
is no way to see a plain, un-clustered list. The existing "Collapse all" button
only collapses clusters — it does not remove the grouping.

We want a toggle that turns Jira ticket grouping **on and off**.

## Scope

- Applies to **both** open-PR view modes (segments and flat) **and** the
  Recently Merged tab.
- "Off" removes ticket **clustering** only. Each PR renders as its own row and
  still shows its own ticket badge; rows are ordered newest-first (updated_at
  DESC), which is the existing sort.
- Default state: **grouping on** (current behavior). Persisted across reloads.

## Approach (chosen)

Add a `cluster` flag to the pure `groupByTicket` helper and thread a
`groupByJira` boolean prop from `PRsView` down to `PRTable` and `PRSections`.
This reuses every existing render and collapse code path:

- Cluster headers only render when a group has `prs.length > 1`. With grouping
  off, every group is a singleton, so no headers appear.
- `hasGroups` (derived from groups of length > 1) becomes `false`, so the
  "Collapse all / Expand all" button hides automatically via its existing guard.
- Single-PR groups still expose `singleTicket`, so per-row ticket badges stay.

Rejected alternatives:

- **Separate ungrouped render branch in `PRTable`** — duplicates the row
  markup that lives inside the group `.map()`; two paths can drift.
- **Sidebar checkbox only** — the filter sidebar is open-tab-only, so the
  merged tab could not get it; conflicts with the "both views" scope.

## Changes

### 1. Data layer — `src/utils/tickets.ts`

Add an optional `cluster` parameter (default `true`) to `groupByTicket`:

```ts
export function groupByTicket(
  prs: GitHubPR[],
  cluster = true,
): { ticket: string | null; prs: GitHubPR[] }[] {
  const sorted = [...prs].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  if (!cluster) {
    // One group per PR, newest-first, each still carrying its ticket key so the
    // per-row ticket badge renders. No group has >1 PR, so nothing clusters.
    return sorted.map((pr) => ({
      ticket: extractTicketKey(sourceFromPR(pr)),
      prs: [pr],
    }));
  }

  // ...existing clustering logic unchanged...
}
```

Default `true` keeps all other callers behaving exactly as today.

### 2. State + control — `src/views/prs/PRsView.tsx`

- New state mirroring the `viewMode` pattern:

  ```ts
  const [groupByJira, setGroupByJira] = useState<boolean>(() => {
    return localStorage.getItem("dev-home-prs-group-by-jira") !== "false";
  });

  const handleGroupByJira = (next: boolean) => {
    setGroupByJira(next);
    localStorage.setItem("dev-home-prs-group-by-jira", String(next));
  };
  ```

- New icon toggle button in the `.prs-view-actions` bar:
  - Icons: `IconLayersLinked` when on, `IconLayersOff` when off
    (both verified present in `@tabler/icons-react@^3`).
  - `aria-pressed={groupByJira}`, `title`/`aria-label`:
    `"Ungroup Jira tickets"` when on, `"Group by Jira ticket"` when off.
  - Reuses the existing `.prs-view-toggle-btn` styling; an `.active` modifier
    (or `aria-pressed` selector) indicates the on state.
  - **Open tab:** rendered alongside the view-mode toggle (shown for both
    segments and flat), so the existing `subTab === "open"` actions block gains
    one button.
  - **Merged tab:** the actions block currently renders only when
    `groupState.hasGroups`. Restructure so the group toggle renders whenever
    `filteredMergedPRs.length > 0`, with "Collapse all" nested inside the
    existing `hasGroups` guard.

### 3. Prop threading

- `PRsView` passes `groupByJira={groupByJira}` to:
  - the flat open `<PRTable>`,
  - the merged `<PRTable>`,
  - `<PRSections>`.
- `PRTable` (`src/components/PRTable.tsx`):
  - Add `groupByJira?: boolean` prop (default `true`).
  - Change the single call site `const groups = groupByTicket(prs);` to
    `groupByTicket(prs, groupByJira)`.
- `PRSections` (`src/components/PRSections.tsx`):
  - Add `groupByJira?: boolean` prop (default `true`).
  - Pass it to each section's child `<PRTable groupByJira={groupByJira} />`.
  - Pass it into the `allGroupTickets` memo:
    `groupByTicket(grouped[section.id], groupByJira)` so the shared collapse
    bookkeeping agrees (produces no collapsible tickets when off).

## Behavior summary

| State | Segments view | Flat view | Merged tab | Collapse-all btn |
|-------|---------------|-----------|------------|------------------|
| On (default) | action sections + ticket clusters | ticket-clustered list | ticket-clustered list | visible when clusters exist |
| Off | action sections, no clusters | plain newest-first rows | plain newest-first rows | hidden |

Toggling off then on restores the persisted per-ticket collapse state, since
that state is untouched by the toggle.

## Testing

- Add a unit test for the pure helper: `groupByTicket(prs, false)` returns one
  singleton group per PR, in updated_at DESC order, each carrying its ticket
  key; and that PRs sharing a ticket are **not** clustered when `cluster` is
  false. Confirm `cluster = true` / default is unchanged.
- Manual check: toggle in segments, flat, and merged; verify persistence across
  reload and that "Collapse all" hides when grouping is off.

## Out of scope

- Hiding ticket badges entirely (the toggle only affects clustering).
- Per-view independent toggle state (one shared preference across all views).
- Changes to review-requests / org-prs tables (default keeps them grouped).
