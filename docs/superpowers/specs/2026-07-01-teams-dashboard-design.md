# Teams & Team Dashboard — Design

**Date:** 2026-07-01
**Scope:** A new read-only "Teams" feature — team management (CRUD) plus a per-team
aggregated dashboard that combines Jira and GitHub signals for an engineering manager.

## Background

Dev Home today is a single-user dashboard: one Jira email, one GitHub username, one
GitHub org in config, and every view shows "my" work. This feature adds a second axis —
**defining teams of other people and observing their work** — so an engineering manager
can answer, at a glance:

- What is the team working on this sprint (and in the last two weeks)?
- Who has how many tickets / PRs, in what status? Is the load balanced?
- What epics is the team working on?
- What work is happening **outside** the sprint board (PRs with no ticket, or tickets in
  other projects)?

Jira alone can answer some of this, but not the cross-system stitching (PR↔ticket linkage,
off-board PR activity, per-member workload across both tools). That stitching is the point
of this feature.

## Goals

1. Define teams with a name and a roster of members. Each member is a resolved pairing of
   a **Jira user** (searched by name/email) and a **GitHub user** (searched in the org).
2. A per-team dashboard aggregating Jira tickets + GitHub PRs for the roster.
3. Group tickets by **epic** (with a synthetic "No epic" bucket).
4. **Workload bar charts**: assigned tickets per member, PRs created per member.
5. A **sortable/filterable data table** of sprint issues with linked PRs, swappable to a
   read-only kanban-style status board.
6. Surface **PRs outside the sprint** (last 2 weeks) prominently, not buried.
7. Optional Jira **board/sprint** selection: current sprint by default, with last two
   closed sprints selectable. A board is optional; without one, the dashboard falls back
   to a roster-wide open-ticket view.

## Non-goals

- **Read-only.** No actions on team items — no Claude runs, no notes, no kanban writes,
  no editing tickets/PRs. This keeps team data cleanly separated from the user's personal
  kanban/focus/notes state.
- No new chart library — workload charts use plain CSS bars.
- No test framework added (see Testing). Pure logic is kept isolated so tests can be added
  later.
- No changes to existing personal views.

## Key decisions (from brainstorming)

- **People-first scoping.** A team = its members. Jira tickets are fetched by member; PRs
  by member. A board, when set, adds a **sprint lens** on top; it never replaces the roster
  as the unit of "the team." Out-of-sprint work for members is surfaced, not hidden.
- **Store the Jira `accountId`.** Jira `emailAddress` is frequently hidden by account
  privacy settings, so email is display-only and all assignee matching is by `accountId`.
- **Board is optional per team.** No board → no sprint selector; dashboard shows roster-wide
  open tickets + PRs.
- **PR↔ticket linkage** reuses the existing Jira-key-in-PR-title convention
  (`extractTicket()` in `src/utils/tickets.ts`).
- **Off-board PRs** get a highlighted KPI stat near the top (clickable → scrolls to the
  full section lower down) so the signal is always visible without scrolling.

---

## Data model (SQLite — two new tables)

Added as appended migrations in `server/src/db.ts` (append-only convention; never reorder).

**`teams`**

| column           | type    | notes                                  |
|------------------|---------|----------------------------------------|
| `id`             | INTEGER | PK autoincrement                       |
| `name`           | TEXT    | not null                               |
| `jira_board_id`  | INTEGER | nullable — the selected Scrum board    |
| `jira_board_name`| TEXT    | nullable — cached for display          |
| `created_at`     | TEXT    | default `datetime('now')`              |
| `updated_at`     | TEXT    | default `datetime('now')`              |

**`team_members`**

| column            | type    | notes                                       |
|-------------------|---------|---------------------------------------------|
| `id`              | INTEGER | PK autoincrement                            |
| `team_id`         | INTEGER | FK → teams.id (cascade delete at app level) |
| `display_name`    | TEXT    | not null — from the Jira user picked        |
| `jira_account_id` | TEXT    | not null — the stable matching key          |
| `jira_email`      | TEXT    | nullable — display only, may be hidden      |
| `github_username` | TEXT    | not null                                    |
| `created_at`      | TEXT    | default `datetime('now')`                   |

Deleting a team deletes its members. No CHECK constraints (matches the fork's convention of
app-level validation).

---

## Backend

### New Jira client capability — Agile API

`server/src/clients/jiraApiClient.ts` gains a second factory (or a `basePath` param) for the
**Jira Software Agile API** at `{jiraBaseUrl}/rest/agile/1.0`. Same host, same Basic auth as
the existing `/rest/api/3` client — only the path prefix differs.

### New endpoints (search / pickers)

Added to `server/src/routes/jira.ts` (or a small new router mounted under `/api/jira`):

- **`GET /api/jira/users/search?q=`** → proxies `GET /rest/api/3/user/search?query=`.
  Returns `{ accountId, displayName, emailAddress|null, avatarUrl }[]`
  (`avatarUrl` = `avatarUrls["24x24"]`). Powers the member Jira type-ahead.
- **`GET /api/jira/boards/search?q=`** → proxies `GET /rest/agile/1.0/board?type=scrum&name=`.
  Returns `{ id, name, projectKey, projectName }[]` from `values[].location`. Paginates via
  `startAt`/`maxResults`/`isLast`. Powers the team board picker.
- **`GET /api/jira/boards/:id/sprints`** → `GET /rest/agile/1.0/board/{id}/sprint?state=active,closed`.
  Returns the active sprint + recent closed sprints: `{ id, name, state, startDate, endDate }[]`.
  Paginates (active/future sprints can sit past page 1). Powers the sprint dropdown.

### Teams CRUD

New router `server/src/routes/teams.ts`, mounted `app.use("/api/teams", teamsRoutes)` in
`server/src/index.ts` (matches existing mount pattern).

- `GET /api/teams` — list teams (with member counts).
- `POST /api/teams` — create `{ name, boardId?, boardName? }`.
- `PUT /api/teams/:id` — update name/board.
- `DELETE /api/teams/:id` — delete team + members.
- `GET /api/teams/:id/members`, `POST .../members`, `DELETE .../members/:memberId`.

### Dashboard aggregator

**`GET /api/teams/:id/dashboard?sprintId=`** — one composed call. Steps:

1. Load roster (accountIds + github usernames) from SQLite.
2. **Jira issues:**
   - If the team has a board **and** a sprint is in play: fetch board-scoped sprint issues
     via `GET /rest/agile/1.0/board/{boardId}/sprint/{sprintId}/issue`
     (preferred over the board-less variant, which has a team-managed-project bug), with
     `fields=summary,status,assignee,epic,priority`. Filter to roster `accountId`s.
   - If no board: `GET /rest/api/3/search/jql` with
     `assignee IN (accountIds) AND statusCategory != Done`, `fields=summary,status,assignee,parent,priority`.
     Paginate via `nextPageToken` until `isLast` (token-based, sequential — no `total`).
3. **Epic grouping:** prefer the Agile issue `epic` field (`epic.key`, `epic.name`); fall
   back to `parent` (`parent.key`, `parent.fields.summary`) for board-less JQL — `parent`
   covers both team-managed and company-managed projects. Issues with neither roll up into a
   synthetic **"No epic"** bucket. Never hardcode `customfield_10014`.
4. **GitHub PRs:** for each member, GraphQL search `author:<login> type:pr created:>=<2wk ago>`,
   run in **batches with controlled concurrency** (mirror `fetchCommentsInBatches` in
   `server/src/routes/github.ts` — slice → `Promise.all` per batch). Reuse the existing
   `mapGraphQLPr` shape.
5. **Link PRs → tickets** with `extractTicket(pr.title)`.
6. **Partition PRs:**
   - *in-sprint* — linked ticket key ∈ the sprint issue set.
   - *off-board* — no ticket key, **or** ticket key ∉ the sprint (includes tickets from
     other projects). Restricted to the last 2 weeks.
7. **Compute** per-member counts (tickets by status category; PRs created) for the workload
   bars.

Response (single payload):

```
{
  team: { id, name, board: { id, name } | null },
  sprint: { id, name, state } | null,
  sprints: [{ id, name, state }],          // for the selector
  epics: [{ key, name, total, done, issues: [...] }],  // includes "No epic"
  issues: [{ key, summary, status, statusCategory, assignee, epicKey, linkedPRs: [...] }],
  workload: [{ accountId, displayName, ticketCount, prCount, byStatus: {...} }],
  offBoardPRs: [{ number, title, repo, author, state, ticketKey|null, ticketProject|null }],
  counts: { sprintIssues, epics, offBoardPRs },
  errors: [ ... ]                          // partial-failure messages
}
```

Batching/concurrency and per-source try/catch mean one failing source degrades gracefully
rather than failing the whole dashboard.

---

## Frontend

### Navigation

New nav group `"Teams"` in `src/config/navTabs.ts` with two entries:

- **`teams`** — team list & management.
- **`team-dashboard`** — the aggregated dashboard.

Wire into `App.tsx`: add `tabMeta` entries (icons: `IconUsersGroup` / `IconChartBar`), an
`isTabVisible` gate on `!!githubOrg` (same gating style as `org-prs`), and the
`{effectiveTab === "..." && <View />}` render branches. Both respect `hiddenTabs`.

### Services & hooks

Follow the established `hook → service → apiClient` pattern (`apiClient` from
`src/services/config.ts`, base URL resolved via Electron IPC / `VITE_API_PORT`).

- `src/services/teams.ts` — team + member CRUD.
- `src/services/teamDashboard.ts` — the single aggregated GET.
- Additions to `src/services/jira.ts` — `searchJiraUsers`, `searchJiraBoards`, `getBoardSprints`.
- `src/hooks/useTeams.ts`, `src/hooks/useTeamDashboard.ts` — mirror `useDashboard`'s
  loading/error/refresh shape.

### Views

**`src/views/teams/TeamsView.tsx`** — list of teams with create/edit/delete. The team editor
includes the **member-add row**: two type-aheads side by side — a Jira user search
(`SearchableDropdown`-style, backed by `searchJiraUsers`) and a GitHub member search (backed
by the existing `org-members` data). Selecting both halves and confirming creates a member
(resolved `accountId` + `github_username`). Also a board picker (searchable, optional).

**`src/views/teams/TeamDashboardView.tsx`** — team selector + optional sprint selector, then
the section stack:

1. **KPI strip** — sprint issue count, epic count, and the **off-board PR count**
   (highlighted, clickable → scrolls to §5). This is the "A+B" placement decision.
2. **Epics** — cards, each with a tickets-done progress bar; includes the "No epic" bucket.
3. **Workload bars** — two CSS-bar charts (assigned tickets, PRs created), horizontal bars.
   Clicking a member's bar filters the issue table below to that member.
4. **Sprint issues** — a new **TanStack-based** (`@tanstack/react-table`, already a dep)
   sortable/filterable data table with columns Key / Summary / Assignee / Status / Epic /
   Linked PR (PR number + checks status). **List / Board toggle**: Board renders a
   **read-only** kanban-style column layout reusing the visual style and the `KANBAN_COLUMNS`
   status mapping from `src/hooks/useKanban.ts` — but **not** the DnD `KanbanBoard`
   component (which is coupled to write actions). A lightweight read-only board component is
   built for this.
5. **Off-board PRs** — highlighted section; last 2 weeks; each row flags *no ticket* vs
   *ticket in another project*.

### UI conventions

- Empty states via the existing `EmptyState` component.
- Errors: partial-failure messages surfaced per the existing accumulated-`error` convention;
  each section degrades independently.
- Any success confirmations use the bottom fixed toast, **not** inline alerts (per the
  `no-layout-shift-confirmations` convention).

---

## Data flow summary

```
TeamDashboardView
  └─ useTeamDashboard(teamId, sprintId)
       └─ teamDashboard.ts  → GET /api/teams/:id/dashboard?sprintId=
                                   └─ roster (SQLite)
                                   ├─ Jira: Agile sprint issues OR JQL (by accountId)
                                   ├─ GitHub: batched PR search (by login, last 2wk)
                                   ├─ link PRs↔tickets (extractTicket)
                                   ├─ partition in-sprint / off-board
                                   └─ group by epic + per-member counts
```

## Error handling

- Backend wraps each external source in try/catch; failures append to `errors[]` and the
  section renders empty rather than failing the whole response.
- Frontend shows accumulated errors in the existing dismissible alert style; each dashboard
  section renders independently.

## Testing

No test runner is installed in this fork, and none is added here. The aggregation logic —
ticket linking, PR partitioning, epic grouping, per-member workload counting — is written as
**pure functions with no I/O**, isolated in helper modules, so a runner (e.g. Vitest) can be
added later to cover them without refactoring.

## Isolation / boundaries

- **Team storage** (SQLite tables + CRUD router) is independent of all existing tables.
- **Jira Agile client** is additive; the existing `/rest/api/3` client is untouched.
- **Pure aggregation helpers** (linking, partitioning, grouping, counting) have no I/O and
  are independently understandable/testable.
- **Read-only board component** is a new, self-contained visual component; the existing
  write-enabled `KanbanBoard` is not modified or coupled to.
- The dashboard aggregator is the single integration seam; each data source degrades
  independently behind it.
