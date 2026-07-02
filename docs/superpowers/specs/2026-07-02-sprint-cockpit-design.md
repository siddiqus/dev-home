# Sprint Cockpit — Design Spec

**Date:** 2026-07-02
**Branch:** `teams`
**Status:** Approved for planning

## 1. Goal

Transform the current team sprint dashboard from a *reporting* view (counts, ticket
lists, "PRs created") into a *management cockpit* that answers three questions within
ten seconds:

1. **Are we on track?**
2. **Where is work stuck?**
3. **Who needs help, review, or scope protection?**

## 2. Current state (baseline)

- **Frontend:** React + Bootstrap 5, no charting library (custom CSS/SVG bars).
  `src/views/teams/TeamDashboardView.tsx` is the container; data comes from
  `useTeamDashboard(teamId, sprintId)` → `GET /teams/:id/dashboard?sprintId=`.
  Existing pieces: top-row count cards (sprint issues / epics / off-board PRs),
  epic cards, `WorkloadBars` (ticket counts + "PRs Created (2wk)"),
  `SprintIssueTable`, `ReadOnlyBoard`, `JiraIssueDrawer`, `DescriptionModal`.
- **Backend:** `server/src/routes/teams.ts` + `server/src/services/teamAggregation.ts`.
  Jira Agile API is queried with `fields=summary,status,assignee,epic`; sprint
  start/end dates are already fetched. GitHub PRs come via a per-member batched
  GraphQL search (2-week lookback). PR↔Jira linkage is by title regex.
  **No caching layer, no persistence** — everything is fetched fresh per load.

### Data availability (decisions applied)

| Data point | Availability | Decision |
|---|---|---|
| Story points | Instance-specific custom field, not fetched | **Auto-detect** field via Jira field metadata (memoized) |
| Sprint start/end dates | Available | Use for pace |
| Sprint goal | Easy add | Add to Agile mapping |
| Issue created date | Easy add | Add → scope-change heuristic |
| Due date | Easy add | Add → due-soon risk |
| Status category | Available | Use |
| Time-in-status / transitions | Needs changelog (avoided) | **Approximate** staleness via `now − updated` |
| Blocked / flags / labels | Custom field, not fetched | **Skip for v1** (dropped from panel + risk) |
| Epic link | Available | Use |
| Assignee | Available | Use → unassigned detection |
| PR state + created/merged | Available (`mergedAt` easy add) | Use |
| PR reviews / first-review time | Extend GraphQL query | Add |
| PR requested reviewers | Extend GraphQL query | Add → waiting-review |
| PR CI rollup / details | Rollup available; details easy | Use |
| PR age | Compute from `createdAt` | Compute |

## 3. Architecture: fat backend, thin components

The backend enriches each issue with a `risk` object and signal flags, computes
sprint-level pace/commitment/scope, workload, PR-flow, and hygiene, and returns one
richly-typed `TeamDashboard`. Frontend components are presentational slices of that
object.

**Rationale:** the shared TypeScript type in `src/types/teams.ts` becomes the
coordination contract. Defined once up front, every backend aggregator and every
frontend component can be built independently against it — no shared mutable logic,
no collisions. This matches the existing server-side aggregation pattern and makes
risk/pace logic unit-testable as pure functions.

## 4. Scope decisions & caveats (signed off)

1. **Blocked is dropped** across the Needs-Attention row, the `+3` risk term, and the
   health-strip "blocked" count. Risk thresholds re-tuned without it.
2. **Stale / in-progress age approximated** by `now − updated`. "No movement > 2 days"
   is accurate; "time in progress" is surfaced as "days since update" / "stalest item"
   and labeled honestly so it is not read as true cycle time.
3. **Scope-change approximated** by `issue.created > sprint.startDate` — catches newly
   created tickets, misses pre-existing tickets dragged into the sprint. Captioned
   "new tickets added after start."
4. **Burn-up requires history we don't have.** Add a SQLite table that snapshots
   `{sprintId, date, committedSP, doneSP, doneCount}` on each dashboard load. History
   accrues from the first load; UI states "tracking since <date>" for sprints already
   underway.
5. **Charting:** add **recharts** for the burn-up line chart only; keep all bar
   visualizations as existing custom CSS/SVG to match current style.

## 5. Data contract

Enriched types in `src/types/teams.ts` (shared FE + BE contract).
`Ref` is a lightweight pointer used in drill-down arrays so panels don't duplicate
full objects: `type Ref = { kind: 'issue'; key: string } | { kind: 'pr'; repo: string; number: number }`.

```ts
DashboardIssue += {
  storyPoints: number | null
  createdAt: string | null
  dueDate: string | null
  updatedAt: string | null
  ageDays: number
  daysSinceUpdate: number
  flags: {
    unassigned: boolean
    noEpic: boolean
    noStoryPoints: boolean
    stale: boolean            // in-progress & daysSinceUpdate > 2
    addedAfterStart: boolean  // created > sprint.startDate
    dueSoon: boolean
    prFailingCI: boolean
    prWaitingReview: boolean  // linked PR open & waiting review > 24h
    inProgressNoPR: boolean
  }
  risk: { score: number; level: 'normal' | 'attention' | 'high'; reasons: string[] }
}

TeamDashboard += {
  pace: {
    dayOfSprint: number; sprintLength: number; elapsedPct: number
    committedSP: number; doneSP: number; remainingSP: number
    doneSPpct: number; behindPace: boolean
  }
  scope: { addedCount: number; addedSP: number }
  needsAttention: {          // arrays of issue/PR refs (ids/keys) for drill-down
    stale: Ref[]; waitingReview: Ref[]; failingCI: Ref[]; noLinkedPR: Ref[]
    offBoard: Ref[]; scopeCreep: Ref[]; unassigned: Ref[]; noEpic: Ref[]
  }
  workload[]: += {
    sp: number; doneSP: number; wip: number
    avgDaysSinceUpdate: number; stalest: Ref | null
    prOpen: number; prReviewing: number; prMerged: number
    riskLevel: 'normal' | 'attention' | 'high'
  }
  prFlow: {
    open: number; merged: number; avgFirstReviewH: number | null
    avgAgeDays: number; failingChecks: number; noJira: number; jiraNoPR: number
  }
  hygiene: { prNoJira: Ref[]; jiraNoPR: Ref[]; mergedNotDone: Ref[]; doneNoMerged: Ref[] }
  burnup: {
    trackingSince: string
    points: { date: string; committedSP: number; doneSP: number; ideal: number }[]
  }
  insights: { key: string; severity: 'info'|'warn'|'critical'; title: string; detail: string }[]
}
```

### Risk scoring (blocked removed)

```
+2  stale (in-progress, no movement > 2 working days)
+2  linked PR has failing CI
+2  linked PR waiting review > 24h
+1  no assignee
+1  no epic
+1  no story points
+1  due date near
+1  added after sprint start

0–2  = normal
3–5  = needs attention
6+   = high risk
```

### Manager insight cards (derived from the above)

"Behind Pace", "Scope Increased", "Review Bottleneck", "Stale Work",
"Hidden Work" (off-board PRs), "Epic Drift" (no-epic count), "Done Mismatch"
(merged but Jira not done), "Unstarted Commitment" (To-Do SP with N days left).

## 6. Target layout

- **Header:** team / sprint selectors, sprint dates, day-of-sprint, last-synced.
- **Row 1 — Sprint Health strip:** progress vs time, committed/done/remaining SP,
  completion-vs-time, scope change, at-risk count, off-board PRs.
- **Row 2 — Flow:** left = burn-up chart, right = Needs-Attention panel (clickable).
- **Row 3 — Epic progress:** cards with tickets, SP, done SP, risk chips.
- **Row 4 — Team Workload & Flow:** per person — SP, done SP, WIP, avg days-since-update,
  PRs open/reviewing/merged, risk. Styled as "who needs help", **not** a leaderboard.
- **Row 5 — Delivery Hygiene:** PRs without Jira, Jira without PR, merged-but-not-done,
  done-without-merged-PR, failing checks.
- Existing list/board views and drawers retained below.

## 7. Parallel decomposition

**Wave 0 — Foundation (1 agent, blocks all):** write the enriched `TeamDashboard` /
`DashboardIssue` types **and** internal `RawIssue` / `RawPR` enriched interfaces. This
is the contract every other agent codes against.

**Wave 1 — Backend (parallel against Wave-0 interfaces):**
- **B1** Jira: auto-detect SP custom field (memoized cache) + add `created`, `duedate`,
  sprint `goal` to both the Agile and JQL fallback fetch paths.
- **B2** GitHub: enrich PR GraphQL query — `mergedAt`, reviews (first-review time),
  requested reviewers, check details; extend `RawPR` + mapping.
- **B3** Aggregation: per-issue flags + risk scoring (pure module, TDD).
- **B4** Aggregation: sprint pace + commitment + scope change (pure module, TDD).
- **B5** Aggregation: workload v2 — SP/doneSP/WIP/avgDaysSinceUpdate/PR counts (TDD).
- **B6** Aggregation: PR-flow metrics + delivery hygiene (TDD).
- **B7** Burn-up: SQLite snapshot table + write-on-load + history read.
- **B8** Assemble enriched response in `/teams/:id/dashboard` (integrates B1–B7).

**Wave 2 — Frontend (parallel, each renders a slice against the Wave-0 type using
fixtures until backend lands):**
- **FE1** Sprint Health strip (Row 1)
- **FE2** Needs-Attention panel (Row 2 right) — clickable signals → filtered issue/PR
  lists, reusing existing drawer/modal
- **FE3** Burn-up chart (Row 2 left) — recharts line, ideal vs actual, "tracking since"
- **FE4** Epic cards v2 (Row 3) — SP, done SP, risk chips
- **FE5** Team Workload & Flow table (Row 4) — non-leaderboard styling
- **FE6** PR-Flow section (Row 5 area) — replaces "PRs Created"
- **FE7** Delivery Hygiene section (Row 5)
- **FE8** Header/filters + manager insight cards + drill-down wiring

**Wave 3 — Integration (1 agent):** recompose `TeamDashboardView` into the row layout,
remove superseded sections, connect drill-downs, verify against the live backend.

### Testing

Pure aggregation modules (B3–B6) built with **TDD** (unit tests for risk scoring, pace,
workload, PR-flow/hygiene). Frontend components get light render tests. Wave 3 verifies
end-to-end against the running backend.

## 8. Out of scope (v1)

- Blocked-ticket detection (needs a chosen Jira signal).
- True time-in-status / cycle time (needs changelog).
- Sprint-membership history for exact scope-creep (needs sprint-field changelog).
- Stale-branch detection.
- Server-side caching (noted as a future improvement given added payload).
