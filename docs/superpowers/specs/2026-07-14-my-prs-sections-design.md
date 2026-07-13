# My PRs — Sectioned Open PRs

**Date:** 2026-07-14
**Status:** Approved design, pending spec review

## Summary

Split the **Open PRs** table on the "My PRs" page into four collapsible sections that
triage a PR by its current state, so the author can immediately see what needs their
attention versus what is done. Only the **Open PRs** sub-tab is affected; **Recently
Merged** stays a single table (review/merge state is meaningless for merged PRs).

## Sections

Rendered in this order:

1. **Ready to merge** — approved or already in the merge queue.
2. **Needs action** — CI is red, or a reviewer left non-approving feedback.
3. **Pending review** — healthy and waiting (catch-all).
4. **Drafts** — draft PRs, regardless of state (drafts can't merge).

Each section has a color-coded icon for fast scanning:

| Section        | Icon (Tabler)              | Color token                  |
| -------------- | -------------------------- | ---------------------------- |
| Ready to merge | `IconCircleCheck`          | `--color-status-success`     |
| Needs action   | `IconAlertTriangle`        | `--color-status-danger`      |
| Pending review | `IconClock`                | `--color-text-secondary`     |
| Drafts         | `IconGitPullRequestDraft`  | `--color-text-muted`         |

## Categorization logic

A single pure function assigns each open PR to exactly one section. Rules are evaluated
top-down; the **first match wins** (this encodes "Needs action wins" precedence, and
pulls drafts out before anything else):

```
categorizeOpenPR(pr):
  1. pr.draft                                   -> "draft"
  2. isRed(pr.checks_status)
       OR isNonApprovingReview(pr.review_status) -> "needs-action"
  3. pr.in_merge_queue
       OR pr.review_status === "APPROVED"        -> "ready"
  4. (everything else)                           -> "pending"
```

Helper predicates:

- `isRed(status)` — `status ∈ {"FAILURE", "ERROR", "STARTUP_FAILURE", "TIMED_OUT"}`
  (the red-icon statuses in `ChecksStatusIcon`'s `STATUS_CONFIG`).
- `isNonApprovingReview(status)` — `status ∈ {"CHANGES_REQUESTED", "REVIEWED"}`
  (`REVIEWED` = comment-only review; `APPROVED` is deliberately excluded).

### Consequences (worked examples)

| PR state                                   | Section        |
| ------------------------------------------ | -------------- |
| Draft, any checks/reviews                  | Drafts         |
| Approved, CI red                           | Needs action   |
| Approved, CI green/pending                 | Ready to merge |
| In merge queue                             | Ready to merge |
| Changes requested (even with an approval*) | Needs action   |
| Comment-only review, CI green              | Needs action   |
| No reviews, CI red                         | Needs action   |
| No reviews, CI green                       | Pending review |
| No reviews, CI pending / no checks         | Pending review |

\* The backend rolls up `review_status` as `CHANGES_REQUESTED > APPROVED > REVIEWED`
(`server/src/routes/github.ts` `deriveReviewStatus`), so a PR with both a change request
and an approval already reports `CHANGES_REQUESTED` → Needs action. Consistent.

## Behavior

- **Empty sections are hidden.** A section renders only if it has at least one PR.
- **Zero open PRs total** → the existing single empty state shows (unchanged).
- **Loading** → the existing spinner shows while the first load is in flight (unchanged).
- **Filters first.** Search and repo filters are applied *before* categorization, so
  section membership and counts always reflect the current filter. The sub-tab count
  (`Open PRs (N)`) is unchanged (total of the filtered list).
- **Collapse state persists** per section in `localStorage`
  (key `dev-home-myprs-section-collapsed`). All sections start expanded.
- **Section header** shows: chevron (expanded/collapsed) + color icon + label + count
  badge. The count is always visible, including when collapsed.
- **Ticket grouping inside each section** continues to work — PRs sharing a Jira ticket
  are grouped and individually collapsible, exactly as today, just scoped to the section.
- **"Collapse all / Expand all" toolbar button** (top-right of the sub-tab bar) is
  repointed to collapse/expand the **sections** instead of ticket groups. It appears
  whenever there is more than one visible section.

## Sticky column headers

Because each section renders its own table (and therefore its own column header row),
the column headers are made **sticky on scroll** so context is never lost while scrolling
a long list.

- Scroll container is `.main-content` (`overflow: auto`, in `src/styles/reset.css`).
- `position: sticky; top: 0` is applied to the table header cells (`th`), with an opaque
  background (`--color-bg-app`/`--color-bg-panel`) and a `z-index` above the rows so body
  rows don't bleed through.
- As the user scrolls out of one section, its pinned header is pushed up and replaced by
  the next section's header — standard multi-table sticky behavior.
- Section headers themselves are **not** sticky in this iteration (scope: column headers
  only); this keeps stacking simple and avoids fragile dynamic-offset math.

## Architecture

Chosen approach: a dedicated wrapper component (keeps `PRTable` reusable for its other
four variants, and keeps the categorization logic isolated and unit-testable).

### New: `src/utils/prCategories.ts`

Pure, dependency-free logic + presentation metadata.

- `type OpenPRSection = "ready" | "needs-action" | "pending" | "draft"`
- `categorizeOpenPR(pr: GitHubPR): OpenPRSection`
- `RED_CHECK_STATUSES`, `NON_APPROVING_REVIEW_STATUSES` sets.
- `OPEN_PR_SECTIONS`: ordered metadata array `{ id, label, icon, colorVar }` driving
  render order and headers.
- `groupPRsBySection(prs: GitHubPR[]): Record<OpenPRSection, GitHubPR[]>` convenience.

Unit tested (`prCategories.test.ts`) covering every row of the worked-examples table
plus precedence edge cases (approved+red, draft+approved, comment-only+green).

### New: `src/components/PRSections.tsx` (+ `PRSections.css`)

- Props: the PR list + all `PRTable` passthrough props (`jiraIssues`, `jiraBaseUrl`,
  `claudeEnabled`, `claudeSessions`, `onClaudeAction`, `onViewClaudeSession`, `loading`).
- Categorizes via `groupPRsBySection`, renders one collapsible section per non-empty
  bucket in `OPEN_PR_SECTIONS` order, each wrapping
  `<PRTable variant="my-prs" prs={bucket} ... />`.
- Owns section collapse state + `localStorage` persistence.
- Exposes an imperative handle `{ visibleSectionCount, allCollapsed, toggleCollapseAll }`
  (via `forwardRef`/`useImperativeHandle`) plus an `onCollapseStateChange` callback,
  mirroring the existing `PRTable` handle pattern so `PRsView`'s toolbar wiring barely
  changes.
- Handles top-level loading/empty so the inner `PRTable`s always receive a non-empty list.

A small internal `CollapsibleSection` (header + chevron + icon + count + body) lives in
this file; extraction to a shared primitive is deferred unless a second consumer appears.

### Changed: `src/components/PRTable.tsx`

- Add an optional prop to **suppress the inner per-table ticket-collapse toolbar** when
  the table is rendered inside a section (e.g. `showGroupToolbar?: boolean`, default keeps
  today's behavior). Section-level collapse is the primary control in sectioned mode.
- Make column header cells sticky (CSS in `PRTable.css`; applies to all variants — a
  net improvement for the other long tables too).
- No change to the 5 existing variants' column definitions.

### Changed: `src/views/prs/PRsView.tsx`

- For the **open** sub-tab, render `<PRSections ...>` instead of the single `<PRTable>`.
- Repoint the collapse-all button ref/state from the single table handle to the
  `PRSections` handle; relabel to reflect sections (button copy stays "Collapse all" /
  "Expand all"). Show it when `visibleSectionCount > 1`.
- **Recently Merged** sub-tab is unchanged.

## Testing

- **Unit:** `prCategories.test.ts` — full categorization matrix + precedence edges.
- **Component (if a frontend test harness exists):** `PRSections` renders only non-empty
  sections, hides all when empty, persists/restores collapse state, and routes each PR to
  the right section. Verify test tooling during planning; fall back to unit tests if no
  component harness is configured.
- **Manual:** run the app, confirm sections, counts, collapse persistence, sticky headers
  on scroll, and that Recently Merged is untouched.

## Out of scope

- Org PRs / Review Requests / Recently Merged tables (unchanged; they keep their single
  table and existing behavior — they only inherit sticky headers as a side benefit).
- Sticky **section** headers (only column headers this iteration).
- Any backend / API changes — all required fields (`checks_status`, `review_status`,
  `in_merge_queue`, `draft`) are already populated by `GET /api/github/prs`.
