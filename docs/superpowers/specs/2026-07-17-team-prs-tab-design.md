# Team PRs tab — design

- **Date:** 2026-07-17
- **Status:** Approved (mockup reviewed)
- **Area:** `src/views/teams/TeamDashboardView.tsx`, new `src/views/teams/TeamPRsTab.tsx`, `src/App.tsx`

## Problem

The team dashboard is Jira-only (sprint cockpit). Users want to see the pull
requests of a team's members in one place — essentially the existing **Org PRs**
experience, but with the author filter locked to the selected team's roster.

## Goals

- Add a **PRs** view to the team dashboard, alongside the existing sprint cockpit.
- Reuse the Org PRs data + rendering stack (`fetchOrgPRsMulti`,
  `fetchRecentlyMergedPRs`, `PRTable`) rather than reimplementing PR fetching.
- Author filter is **locked to the team roster**; a member sub-filter narrows it.
- No regression to the existing Org PRs view.

## Non-goals

- No backend changes — the existing `/github/org-prs` and `/github/merged-prs`
  endpoints already accept `author` / `repo` filters.
- No sprint-scoping of PRs (see Scope decision).
- Not extracting a shared `PRExplorer` core out of `OrgPRsView` (rejected
  approach A — too invasive for a working 600-line view).

## Approach (chosen: B — focused new component)

`OrgPRsView` (~600 lines) carries filter state, localStorage caching, Open/Merged
sub-tabs, cursor pagination, and saved filters. With authors **locked to a
roster** (always multiple authors) we are always in `OrgPRsView`'s "multi mode",
where it already fans out via `fetchOrgPRsMulti` and disables cursor pagination.
So a team tab does not need most of that machinery.

We build a small, well-bounded `TeamPRsTab` that reuses the genuinely heavy,
already-shared pieces — the `github.ts` data services, `PRTable` (rows, ticket
grouping, Claude actions), `MultiSelectDropdown`, and the sub-tab CSS in
`PRsView.css`. The existing `OrgPRsView` is left untouched.

## UX / layout

- `TeamDashboardView` gains a top-level tab bar: **Sprint** (existing cockpit)
  and **PRs** (new). The tab pills reuse the `.prs-subtab` visual language.
- The **team selector** stays in the shared toolbar (both tabs are team-scoped).
  The **sprint dropdown** moves inside the Sprint tab (it is meaningless on PRs).
- No team selected → the existing "Select a team" empty state, regardless of tab.

### PRs tab

- Toolbar: a non-interactive **lock badge** ("Authors: <team> (N)"), a
  **Members** sub-filter (`MultiSelectDropdown`, empty = all members), a **Repos**
  filter (`MultiSelectDropdown` from `fetchOrgRepos()`), and a refresh button.
- **Open PRs** / **Merged** sub-tabs, each rendered with `PRTable`
  (`variant="org-prs"` and `variant="recently-merged-org"`). The Open tab keeps
  the "collapse/expand all groups" control (ticket grouping) via `PRTableHandle`.
- Empty states: (a) team has no GitHub-mapped members → dedicated message
  pointing to Manage Teams; (b) filters yield no PRs → `PRTable`'s own empty
  state.

## Data flow

- On first activation of the PRs tab (lazy — the tab's data does not load while
  the Sprint tab is showing): `fetchTeamMembers(teamId)` → roster.
- Effective authors = selected members if any, else the full roster; blank
  `github_username` entries are dropped and the list is deduped. This is the one
  piece of pure logic and is unit-tested (`teamPrsFilters.ts`).
- Open PRs: `fetchOrgPRsMulti(authors, repos)`. Merged:
  `fetchRecentlyMergedPRs("org", authors, repos)`.
- All fetches gated on `configured` (avoids the dynamic-API-port race).
- Refetch triggers: team change, member sub-filter change, repo filter change,
  manual refresh. No persistent localStorage cache in v1 (state is per-session);
  a team-scoped cache can be added later if load feels slow.

## Scope decision

Team PRs are **not sprint-scoped**: they show all open PRs by team members plus
recently merged (last 2 weeks), matching Org PRs semantics. The sprint dropdown
affects only the Sprint tab.

## Claude actions wiring

`App.tsx` currently passes `claudeEnabled` / `claudeSessions` / `onClaudeAction`
/ `onViewClaudeSession` to Org PRs but not to `TeamDashboardView`. We thread the
same four props (plus `jiraIssues` for ticket enrichment) through
`TeamDashboardView` down to `TeamPRsTab` so Claude actions and Jira ticket chips
work exactly as in Org PRs.

## Files

- **New:** `src/views/teams/TeamPRsTab.tsx` — the tab component.
- **New:** `src/views/teams/teamPrsFilters.ts` — `effectiveAuthors(roster,
  selected)` pure helper.
- **New:** `src/views/teams/teamPrsFilters.test.ts` — unit tests for the helper.
- **Edit:** `src/views/teams/TeamDashboardView.tsx` — tab bar, conditional
  rendering, move sprint dropdown into Sprint tab, accept + pass through the
  Claude/jira props.
- **Edit:** `src/App.tsx` — pass `jiraIssues`, `claudeEnabled`, `claudeSessions`,
  `onClaudeAction`, `onViewClaudeSession` to `TeamDashboardView`.
- **Reused as-is:** `services/teams.ts`, `services/github.ts`, `PRTable`,
  `MultiSelectDropdown`, `PRsView.css`.

## Testing

- Unit: `effectiveAuthors` — empty selection returns full roster; selection
  narrows; blank usernames dropped; duplicates removed.
- Component (if a lightweight render test fits existing patterns): PRs tab shows
  the "no GitHub-mapped members" empty state when the roster has no usernames.
- Manual: switch teams, toggle Sprint/PRs, narrow by member and repo, Open vs
  Merged, refresh.
