# Jira Issue Search — Pagination Fix + TSV Export

Date: 2026-07-30
Status: Approved (pending spec review)

## Problem

The Jira issue search shows at most 50 results with no way to see more, and there
is no way to export results.

### Root cause of the "only 50" behavior

The pagination is not absent — it is **broken**. The backend proxies to Jira's
newer `/rest/api/3/search/jql` endpoint (`server/src/routes/jiraFilters.ts:128`),
which is cursor-based (`nextPageToken`) and **returns no `total` field**. As a
result:

- The backend falls back to `total: data.total || issues.length`
  (`jiraFilters.ts:159`), so `total` is always just the current page size (≤50).
- The frontend computes `totalPages = Math.ceil(total / PAGE_SIZE)`
  (`JiraIssueSearch.tsx:53`), which is therefore always `1`.
- The Next Page control is gated on `{totalPages > 1 && ...}`
  (`JiraIssueSearch.tsx:344`), so it never renders.

The `nextPageToken` needed to page forward is already returned all the way to the
component (`nextToken` state) — it is simply never surfaced.

## Goals

1. Let the user page past the first 50 results.
2. Add an **Export** button that downloads **all** matching issues as TSV with
   columns: `key`, `summary`, `status`, `assignee`, `created`, `updated`.

## Non-goals

- No backend changes. No new endpoints.
- No change to how issues are fetched/mapped or to the `searchJql` signature.
- No unrelated refactoring of the search component.

## Decisions (from brainstorming)

- **Pagination UX:** "Load more" (append). Best fit for Jira's token-based API;
  the growing list is also what makes an all-pages export straightforward.
- **Export scope:** all matching issues (not just the loaded rows).
- **Implementation location:** frontend-only. Jira token pagination is inherently
  sequential, so a backend loop would make the identical sequence of Jira calls
  with no speed benefit — not worth a new endpoint.
- **created/updated format in TSV:** date only, in the user's local timezone
  (e.g. `new Date(iso).toLocaleDateString()`). Not full ISO. Not the relative
  time shown in the on-screen table.
- **Export button placement:** in the results header row above the table, small,
  right-aligned. Only visible when there are results.

## Design

### Scope of change

Frontend only:

- `src/components/JiraIssueSearch.tsx` — pagination + export button/handler.
- `src/utils/tsvExport.ts` (new) — pure TSV builder + browser download helper.
- `src/utils/tsvExport.test.ts` (new) — vitest unit tests for the builder.
- `src/components/JiraIssueSearch.css` — minor styling for the header/button row.

No changes to `server/`, `src/services/jiraFilters.ts`, or `src/types.ts`.

### 1. Pagination → "Load more" (append)

- Drive paging purely off `nextToken`. Stop using `total` / `totalPages` / `page`
  and remove the now-dead `PAGE_SIZE`-based math.
- A fresh search (`runSearch`) **replaces** `results` and sets `nextToken`.
- A new **`loadMore()`** calls `searchJql(jql, nextToken)`, **appends** the
  returned issues to `results`, and updates `nextToken`.
- A **"Load more"** button renders whenever `nextToken` is truthy (in the
  existing pagination area below the table). A `loadingMore` state disables it and
  shows a small spinner while fetching.
- Results header count becomes ``${results.length}${nextToken ? "+" : ""} issues``
  — e.g. "50+ issues" → "100+ issues" → "137 issues" once fully loaded. (Jira
  gives no grand total, so a "+" while more pages exist is the honest display.)

State changes in the component:
- Remove: `total`, `page`, `PAGE_SIZE`, `totalPages`.
- Add: `loadingMore: boolean`, `exporting: boolean`, `exportTruncated: boolean`.
- Keep: `results`, `nextToken`, `searching`, `searchError`, `hasSearched`,
  `activeFilterName`.

### 2. Export → TSV of all matching issues

New **Export** button in the `.jql-results-header` (right-aligned, small — `btn
btn-outline-secondary btn-sm` with `IconDownload`), visible only when
`results.length > 0`. Disabled + spinner while `exporting`.

On click (`handleExport`):

1. Loop `searchJql(jql, token)` from the beginning, following `nextPageToken`,
   accumulating **all** issues.
2. Safety cap: **100 pages (~5,000 issues)**. If hit, download what was collected
   and surface a brief, muted "Exported first 5,000 issues (result set was
   larger)" note near the results header. This is a distinct, non-error inline
   message — the red `searchError` banner (titled "Search failed") is reserved
   for actual failures.
3. Build the TSV via `issuesToTsv(issues)` and trigger download via
   `downloadTextFile(...)`.
4. Errors reuse the `searchError` banner. The button re-enables in a `finally`.

Filename: `jira-export-<YYYY-MM-DD>.tsv`. When a saved filter is active, prefix
with a slugified `activeFilterName`, e.g. `my-open-bugs-2026-07-30.tsv`.

### 3. `src/utils/tsvExport.ts`

```ts
import { JiraIssue } from "../types";

// Collapse tab/newline/CR to a single space so the TSV grid stays intact.
function clean(value: string | null | undefined): string { ... }

// Date only, local timezone. Empty/invalid input -> "".
function toLocalDate(iso: string | null | undefined): string { ... }

export function issuesToTsv(issues: JiraIssue[]): string {
  // header row: key\tsummary\tstatus\tassignee\tcreated\tupdated
  // per issue: key, clean(summary), clean(status.name),
  //   clean(assignee?.displayName ?? "Unassigned"),
  //   toLocalDate(created), toLocalDate(updated)
  // rows joined by "\n"
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/tab-separated-values",
): void {
  // Blob -> URL.createObjectURL -> anchor.click() -> URL.revokeObjectURL
}
```

`issuesToTsv` is pure and unit-tested. `downloadTextFile` touches the DOM and is
exercised manually.

### Data flow

```
Load more:  [Load more] -> loadMore() -> searchJql(jql, nextToken)
              -> append issues, update nextToken

Export:     [Export] -> handleExport()
              -> loop searchJql(jql, token) until no token (cap 100 pages)
              -> issuesToTsv(all) -> downloadTextFile(name, tsv)
```

### Error handling

- Load more / export failures set `searchError` (existing red banner); loading
  flags cleared in `finally`.
- Cap reached during export → distinct muted inline note near the results header
  (not the error banner); the partial file still downloads.
- New state `exportTruncated: boolean`, reset at the start of each export.

### Testing

- `src/utils/tsvExport.test.ts` (vitest) covers `issuesToTsv`:
  - header row present and column order correct;
  - `null` assignee → `Unassigned`;
  - tab/newline/CR in summary collapsed to spaces;
  - `created`/`updated` rendered as local dates; empty/invalid → `""`;
  - empty issue list → header row only.
- Run with `yarn test`.
- `downloadTextFile` and the component wiring (Load more append, Export button
  states) verified manually in the running app.

## Files touched (summary)

| File | Change |
|------|--------|
| `src/components/JiraIssueSearch.tsx` | Load-more paging; Export button + handler; drop `total`/`page` math |
| `src/utils/tsvExport.ts` | New: `issuesToTsv`, `downloadTextFile` |
| `src/utils/tsvExport.test.ts` | New: unit tests for `issuesToTsv` |
| `src/components/JiraIssueSearch.css` | Header/button row styling |
