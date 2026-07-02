# Sprint Cockpit — Design Spec

**Date:** 2026-07-02
**Branch:** `teams`
**Status:** Approved for planning

## 1. Goal

Transform the team sprint dashboard from a *reporting* view (counts, ticket lists,
"PRs created") into a management *cockpit*. Three questions, in priority order:

1. **Are we on track?** — overall completion measured against **elapsed time**.
2. **Where is work stuck?** — **stalled** tickets (no movement) and blocked PR flow.
3. **Is load distributed sanely?** — who is overloaded, who is stuck.

Story points and SP-based completion are explicitly **secondary** — the primary
completion signal is **ticket count**, not story points.

## 2. Current state (baseline)

- **Frontend:** React + Bootstrap 5, no charting library (custom CSS/SVG bars).
  `src/views/teams/TeamDashboardView.tsx` is the container; data comes from
  `useTeamDashboard(teamId, sprintId)` → `GET /teams/:id/dashboard?sprintId=`.
  Existing pieces: top-row count cards, epic cards, `WorkloadBars` (ticket counts +
  "PRs Created (2wk)"), `SprintIssueTable`, `ReadOnlyBoard`, `JiraIssueDrawer`,
  `DescriptionModal`.
- **Backend:** `server/src/routes/teams.ts` + `server/src/services/teamAggregation.ts`.
  Jira Agile API queried with `fields=summary,status,assignee,epic`; sprint start/end
  dates already fetched. GitHub PRs via per-member batched GraphQL search (2-week
  lookback). PR↔Jira linkage by title regex. **No caching, no persistence** — fetched
  fresh per load.

### Data availability (decisions applied)

| Data point | Availability | Decision |
|---|---|---|
| Sprint start/end dates | Available | **Core** — drives completion-vs-time |
| Status category (To Do/In Progress/Done) | Available | **Core** — completion + WIP |
| Assignee | Available | **Core** — load distribution + unassigned |
| Issue `updated` timestamp | Available | **Core** — stalled detection (no changelog) |
| Issue created date | Easy add | Add → scope-change heuristic |
| Due date | Easy add | Add → due-soon risk |
| Sprint goal | Easy add | Add to Agile mapping (header) |
| Epic link | Available | Use → epic drift |
| PR state + created/merged | Available (`mergedAt` easy add) | Use → PR flow |
| PR reviews / first-review time | Extend GraphQL query | Add → waiting-review |
| PR requested reviewers | Extend GraphQL query | Add → waiting-review |
| PR CI rollup / details | Available/easy | Use → failing CI |
| PR age | Compute from `createdAt` | Compute |
| Story points | Instance custom field, not fetched | **Optional/secondary** — auto-detect if cheap; nothing depends on it |
| Blocked / flags / labels | Custom field, not fetched | **Out for v1** — stalled is the stuck signal |
| Time-in-status / transitions | Needs changelog (avoided) | Approximate staleness via `now − updated` |

## 3. Architecture: fat backend, thin components

The backend enriches each issue with a `risk` object and signal flags, computes
sprint-level completion/pace/scope, load distribution, PR-flow, and hygiene, and
returns one richly-typed `TeamDashboard`. Frontend components are presentational
slices of that object.

**Rationale:** the shared TypeScript type in `src/types/teams.ts` is the coordination
contract. Defined once up front, every backend aggregator and every frontend component
is built independently against it — no shared mutable logic, no collisions. Matches the
existing server-side aggregation pattern; risk/pace logic is unit-testable as pure
functions.

## 4. Scope decisions & caveats (signed off)

1. **Completion is measured by ticket count**, not story points:
   `donePct = doneCount / totalCount`, compared to `elapsedPct = elapsed / sprintLength`.
   `behindPace` when `donePct` trails `elapsedPct` beyond a tolerance.
2. **Stalled is the stuck signal.** `stale = in-progress AND now − updated > N days`
   (N configurable, default 2 working days). No explicit "blocked" field in v1. Labeled
   honestly as "no movement / days since update," not true cycle time.
3. **Story points are optional.** Auto-detect the SP custom field if present and show it
   as a *secondary* label only; no card, metric, or layout depends on it. If detection
   fails or SP is absent, everything still works on ticket counts.
4. **Scope-change approximated** by `issue.created > sprint.startDate` — catches newly
   created tickets, misses pre-existing tickets dragged in (needs sprint-field changelog,
   avoided). Captioned "new tickets added after start."
5. **Burn-up / completion-over-time needs history we don't have.** Add a SQLite table
   snapshotting `{sprintId, date, doneCount, totalCount}` on each dashboard load. History
   accrues from first load; UI states "tracking since <date>" for in-flight sprints.
   (SP snapshot columns optional if SP detection lands.)
6. **Charting:** add **recharts** for the completion-over-time line chart only; keep all
   bars as existing custom CSS/SVG.

## 5. Data contract

Enriched types in `src/types/teams.ts` (shared FE + BE contract).
`Ref` is a lightweight pointer for drill-down arrays:
`type Ref = { kind: 'issue'; key: string } | { kind: 'pr'; repo: string; number: number }`.

```ts
DashboardIssue += {
  createdAt: string | null
  dueDate: string | null
  updatedAt: string | null
  ageDays: number
  daysSinceUpdate: number
  storyPoints: number | null        // optional/secondary; may be null
  flags: {
    unassigned: boolean
    noEpic: boolean
    stale: boolean                  // in-progress & daysSinceUpdate > N
    addedAfterStart: boolean        // created > sprint.startDate
    dueSoon: boolean
    prFailingCI: boolean
    prWaitingReview: boolean        // linked PR open & waiting review > 24h
    inProgressNoPR: boolean
  }
  risk: { score: number; level: 'normal' | 'attention' | 'high'; reasons: string[] }
}

TeamDashboard += {
  pace: {                           // TICKET-COUNT based
    dayOfSprint: number; sprintLength: number; elapsedPct: number
    totalCount: number; doneCount: number; remainingCount: number
    donePct: number; behindPace: boolean
    // optional SP mirror if detected:
    committedSP?: number; doneSP?: number
  }
  scope: { addedCount: number }     // + addedSP? optional
  needsAttention: {                 // arrays of Refs for drill-down
    stale: Ref[]; waitingReview: Ref[]; failingCI: Ref[]; noLinkedPR: Ref[]
    offBoard: Ref[]; scopeCreep: Ref[]; unassigned: Ref[]; noEpic: Ref[]
  }
  workload[]: += {                  // LOAD DISTRIBUTION (elevated)
    ticketCount: number; wip: number; doneCount: number; stalledCount: number
    avgDaysSinceUpdate: number; stalest: Ref | null
    prOpen: number; prReviewing: number; prMerged: number
    riskLevel: 'normal' | 'attention' | 'high'
    sp?: number; doneSP?: number    // optional
  }
  loadBalance: { max: number; min: number; imbalance: number }  // team spread indicator
  prFlow: {
    open: number; merged: number; avgFirstReviewH: number | null
    avgAgeDays: number; failingChecks: number; noJira: number; jiraNoPR: number
  }
  hygiene: { prNoJira: Ref[]; jiraNoPR: Ref[]; mergedNotDone: Ref[]; doneNoMerged: Ref[] }
  burnup: {                         // ticket-count completion over time
    trackingSince: string
    points: { date: string; doneCount: number; totalCount: number; ideal: number }[]
  }
  insights: { key: string; severity: 'info'|'warn'|'critical'; title: string; detail: string }[]
}
```

### Risk scoring (stalled-centric, no blocked, no SP weight)

```
+3  stale (in-progress, no movement > N days)   <- heaviest
+2  linked PR has failing CI
+2  linked PR waiting review > 24h
+1  no assignee
+1  no epic
+1  in progress with no linked PR
+1  due date near
+1  added after sprint start

0–2  = normal
3–4  = needs attention
5+   = high risk
```

### Manager insight cards (derived)

"Behind Pace" (donePct vs elapsedPct), "Stale Work" (N tickets no movement > Nd),
"Review Bottleneck" (PRs waiting > 24h), "Uneven Load" (imbalance across assignees),
"Hidden Work" (off-board PRs), "Epic Drift" (no-epic count), "Done Mismatch" (merged
but Jira not done), "Scope Increased" (tickets added after start).

## 6. Target layout

- **Header:** team / sprint selectors, sprint dates, day-of-sprint, sprint goal,
  last-synced.
- **Row 1 — On Track?:** completion-vs-time (donePct vs elapsedPct, behind/ahead),
  remaining tickets, scope change, off-board PRs.
- **Row 2 — Stuck & Attention:** left = completion-over-time (burn-up) chart;
  right = Needs-Attention panel led by **Stale Work**, then waiting-review, failing-CI,
  no-linked-PR, unassigned, no-epic (each clickable → filtered list).
- **Row 3 — Load Distribution:** per-person ticket count + WIP + stalled count + PR
  open/merged; team imbalance indicator. Framed "who needs help," not a leaderboard.
- **Row 4 — Epic progress:** cards with tickets, done, stalled chips (SP optional).
- **Row 5 — Delivery Hygiene:** PRs without Jira, Jira without PR, merged-but-not-done,
  done-without-merged-PR, failing checks.
- Existing list/board views and drawers retained below.

## 7. Parallel decomposition

**Wave 0 — Foundation (1 agent, blocks all):** write the enriched `TeamDashboard` /
`DashboardIssue` types (ticket-count pace, optional SP) **and** internal
`RawIssue` / `RawPR` enriched interfaces. The contract every other agent codes against.

**Wave 1 — Backend (parallel against Wave-0 interfaces):**
- **B1** Jira fetch: add `created`, `duedate`, sprint `goal` to both fetch paths.
  *Optional sub-task:* auto-detect SP custom field (memoized) — not on critical path.
- **B2** GitHub: enrich PR GraphQL query — `mergedAt`, reviews (first-review time),
  requested reviewers, check details; extend `RawPR` + mapping.
- **B3** Aggregation: per-issue flags + stalled-centric risk scoring (pure, TDD).
- **B4** Aggregation: completion-vs-time / pace (ticket count) + scope change (TDD).
- **B5** Aggregation: load distribution v2 — ticket/WIP/stalled/done/PR counts +
  imbalance indicator (TDD). **Elevated priority.**
- **B6** Aggregation: PR-flow metrics + delivery hygiene (TDD).
- **B7** Burn-up: SQLite snapshot table (ticket-count) + write-on-load + history read.
- **B8** Assemble enriched response in `/teams/:id/dashboard` (integrates B1–B7).

**Wave 2 — Frontend (parallel, each renders a slice against the Wave-0 type, using
fixtures until backend lands):**
- **FE1** "On Track?" strip (Row 1) — completion vs time
- **FE2** Needs-Attention panel (Row 2 right) — stale-led, clickable → filtered lists
- **FE3** Completion-over-time / burn-up chart (Row 2 left) — recharts, ideal vs actual
- **FE4** Load Distribution row (Row 3) — **elevated**; non-leaderboard styling
- **FE5** Epic cards v2 (Row 4) — tickets/done/stalled chips
- **FE6** PR-Flow section (Row 5 area) — replaces "PRs Created"
- **FE7** Delivery Hygiene section (Row 5)
- **FE8** Header/filters + manager insight cards + drill-down wiring

**Wave 3 — Integration (1 agent):** recompose `TeamDashboardView` into the row layout,
remove superseded sections, connect drill-downs, verify against the live backend.

### Testing

Pure aggregation modules (B3–B6) built with **TDD** (unit tests for risk, pace,
load distribution, PR-flow/hygiene). Frontend components get light render tests.
Wave 3 verifies end-to-end against the running backend.

## 8. Out of scope (v1)

- Explicit blocked-ticket detection (stalled is the proxy).
- Story-point–driven metrics as anything more than a secondary label.
- True time-in-status / cycle time (needs changelog).
- Sprint-membership history for exact scope-creep (needs sprint-field changelog).
- Stale-branch detection.
- Server-side caching (future improvement given added payload).
