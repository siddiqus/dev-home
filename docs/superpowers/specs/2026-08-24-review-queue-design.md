# Review Queue — Sprint Cockpit panel

**Date:** 2026-08-24
**Status:** Approved (design), pending implementation plan
**Related:** `docs/superpowers/specs/2026-07-02-sprint-cockpit-design.md`, skill `analyze-pr-queue`

## Motivation

The team dashboard is a sprint cockpit that already reconciles PRs against Jira
(off-board PRs, PR-has-no-Jira / Jira-has-no-PR, avg first-review hours). What it
cannot answer is the per-PR triage question the `analyze-pr-queue` skill exists
for: **whose court is the ball in, and how long has this PR sat there?**

Today the only review-triage signal is `waitingReview` in
`server/src/services/dashboard/risk.ts:31`:

```
waitingReview = open && !first_review_at && hoursSinceCreation > 24
```

This fires only when a PR has *zero* reviews after 24h. It cannot distinguish:

- waiting on the **author** (changes requested / reviewer reviewed / approved-go-merge), vs
- waiting on the **reviewer** (author pushed, reviewer silent / requested but nobody looked), vs
- **no reviewer assigned at all**.

This spec adds a **Review Queue** panel to the cockpit that computes that state
per PR and lists open PRs sorted so the most-rotting leads.

## Scope

**In:**
- Backend PR enrichment (new GraphQL fields + a second `review-requested:` search).
- A pure state-machine service producing the per-PR triage state.
- A Review Queue panel rendered in the cockpit tab.

**Out (explicitly, to avoid creep):**
- Reviewer-load / bottleneck aggregation (who owes how many reviews, in the
  aggregate).
- An "approved but not merged" row in Needs Attention.
- Board "any-author" mode: we do **not** scan the sprint for PRs whose only link
  is a ticket key with no team involvement.

## Decisions (from brainstorming)

1. **Placement:** a panel *inside* the Sprint cockpit tab, next to PR Flow /
   Needs Attention. It rides the existing `useTeamDashboard` fetch — no new hook,
   no new endpoint.
2. **Inclusion:** a PR belongs in the queue if **any team member authored it OR
   is a requested reviewer on it**. Review-requested inclusion pulls in
   **external-author** PRs (author column may show a non-team login) — this is
   the "what the team owes reviews on" side.
3. **Fidelity:** **lean** — reviews only. We do **not** fetch PR comments or
   review-thread bodies. Author's last action is approximated by last commit
   time. (The skill's comment-based "engaged" is deliberately not ported.)
4. **Bots and team review requests never count as a reviewer** — a `Bot`
   (`__typename`) or a `Team` request means no *person* is looking, so such a PR
   is honestly 🔴 No reviewer.
5. **Open PRs only.** Merged/closed excluded. Drafts are shown, flagged as
   author's court.

## Architecture

Data flows through the existing dashboard pipeline; we add one fetch branch, one
pure service, and one panel.

```
GET /api/teams/:id/dashboard
  fetchMemberPRs(roster)                 [MODIFIED: + review-requested search, + enriched fields]
    -> RawPR[]                           [MODIFIED: RawPR gains reviews[], requestedReviewers[], isDraft, updatedAt, lastCommitAt, reviewDecision]
  computeReviewQueue(prs, now)           [NEW pure service: reviewQueue.ts]
    -> ReviewQueueEntry[]
  res.json({ ..., reviewQueue })         [MODIFIED: add field]

TeamDashboardView (cockpit tab)
  <ReviewQueuePanel entries={dashboard.reviewQueue} />   [NEW component]
```

## Component 1 — PR fetching (`server/src/routes/teams.ts`)

### 1a. Second search — review requests

`fetchMemberPRs(roster)` (currently `teams.ts:175`) today runs one search per
member: `author:<login> type:pr created:>=<2w>`. Add a second search per member:

```
review-requested:<login> type:pr state:open
```

Merge both result sets and **dedupe by `(repo_full_name, number)`**. The
review-requested set is not date-bounded and may include external authors; keep
them. (Author search stays `created:>=<2w>` as today.)

> GitHub's `review-requested:<user>` matches both direct requests and requests
> made via a team the user belongs to — acceptable and desirable (the team is on
> the hook either way).

### 1b. Enrich `MEMBER_PRS_QUERY` (`teams.ts:151`)

Add the fields the state model needs:

```graphql
... on PullRequest {
  number title url state createdAt updatedAt mergedAt headRefName body isDraft
  reviewDecision
  author { login }
  repository { nameWithOwner }
  commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } }
  reviews(first: 20) { nodes { author { login __typename } state submittedAt } }
  reviewRequests(first: 20) {
    totalCount
    nodes { requestedReviewer { __typename ... on User { login } ... on Team { name } } }
  }
}
```

Map into `RawPR` (see Component 3).

## Component 2 — state machine (`server/src/services/dashboard/reviewQueue.ts`, NEW, pure)

```
computeReviewQueue(prs: RawPR[], now: Date): ReviewQueueEntry[]
```

Filters to `state === "open"`, computes state per PR, returns them **sorted by
`updatedAt` ascending** (oldest activity first — rotting leads).

**Derived values per PR:**

- `personReviews` = `reviews` whose author `__typename === "User"` and login is
  not the PR author and not in the ignore list. (Bots excluded.)
- `personRequests` = `requestedReviewers` where `__typename === "User"`. (Teams
  and bots excluded.)
- `engaged` = `personReviews.length > 0`
- `hasReviewer` = `engaged || personRequests.length > 0`
- `reviewerLastActedAt` = latest `submittedAt` among `personReviews`, else null
- `authorLastActedAt` = `max(lastCommitAt, createdAt)` (lean: no comments)

**State — first match wins:**

| # | Condition | `state` | `reason` |
|---|---|---|---|
| 1 | `isDraft` | `author` | `draft` |
| 2 | `!hasReviewer` | `none` | `no reviewer assigned` |
| 3 | `reviewDecision === "CHANGES_REQUESTED"` | `author` | `changes requested` |
| 4 | `engaged && reviewerLastActedAt > authorLastActedAt` | `author` | `approved — ready to merge` if `reviewDecision === "APPROVED"`, else `reviewer reviewed, awaiting author` |
| 5 | `reviewDecision === "APPROVED"` | `author` | `approved — ready to merge` |
| 6 | `engaged` (author acted last) | `reviewer` | `author responded, awaiting re-review` |
| 7 | else (requested, nobody engaged) | `reviewer` | `awaiting first review` |

`state` maps to the badge: `author` → 🔵, `reviewer` → 🟡, `none` → 🔴.

**Reviewer list for display:** persons who reviewed, most-recent-first, then
persons with an open request who have not reviewed. Teams/bots omitted.

**Ignore list:** reuse the same convention the skill uses conceptually — for v1,
a hardcoded empty/bots-only ignore is fine; no config surface added.

## Component 3 — types

Extend `RawPR` (`server/src/services/teamAggregation.ts:20`) with the raw fields:
`updatedAt`, `isDraft`, `reviewDecision`, `lastCommitAt`, and structured
`reviews: { login; typename; state; submittedAt }[]` and
`requestedReviewers: { typename; name }[]`. (Existing `first_review_at` /
`review_state` / `review_requested` stay — other services use them.)

New `ReviewQueueEntry`, declared in **both**
`server/src/services/dashboard/types.ts` and `src/types/teams.ts`:

```ts
interface ReviewQueueEntry {
  number: number;
  repo_full_name: string;
  title: string;
  html_url: string;
  author: string;
  state: "author" | "reviewer" | "none";
  reason: string;
  reviewers: string[];
  checks_status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
```

## Component 4 — response wiring (`server/src/routes/teams.ts:437`)

Add to the `res.json({...})` payload:

```ts
reviewQueue: computeReviewQueue(prs, now),
```

`prs` and `now` are already in scope at that point.

## Component 5 — frontend (`src/views/teams/cockpit/ReviewQueuePanel.tsx`, NEW)

- Rendered in `TeamDashboardView`'s cockpit tab alongside the other panels.
- Props: `{ entries: ReviewQueueEntry[] }` (from `dashboard.reviewQueue`).
- Columns: **State** badge · **Title** (link to `html_url`, keeps the ticket key
  visible) · **Author** · **Reviewer(s)** · **Checks** · **Age / Last-activity**.
- Age = time since `createdAt`; Last-activity = time since `updatedAt`; both via
  `useRelativeTime`, shown as the `8w / 1d` dual read.
- Styling matches sibling panels: Tabler icons + Bootstrap utility classes. **No
  new dependencies** (no chart lib, no table lib). Follows the existing
  `EmptyState` convention when the queue is empty.

## Error handling

- The extra `review-requested` search is wrapped in the same try/catch as the
  existing fetch; a failure pushes to `errors[]` and leaves `reviewQueue` empty
  rather than failing the whole dashboard.
- `computeReviewQueue` is pure and total: missing/invalid dates degrade to
  `authorLastActedAt = createdAt`; a PR with no data still resolves to a state
  (falls through to rule 2 or 7).

## Testing

Following the folder's existing TDD pattern (`risk.test.ts`, `prFlow.test.ts`):

- `server/src/services/dashboard/reviewQueue.test.ts`:
  - one case per state rule (1–7)
  - oldest-activity-first sort
  - bot review excluded (does not make a PR "engaged")
  - team-only review request → `none` (🔴), not `reviewer`
  - external-author PR (team member is reviewer) is included
  - open-only filter (merged/closed excluded)
- `src/views/teams/cockpit/ReviewQueuePanel.test.tsx`: renders rows, badges, and
  the empty state.

## Non-goals / future

- Reviewer-load bottleneck card (recommendation #3) — separate spec.
- Comment-based "engaged" fidelity — would require fetching comments + threads;
  intentionally deferred.
- Configurable ignore list surfaced in Settings.
