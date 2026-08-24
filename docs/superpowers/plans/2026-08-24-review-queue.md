# Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Review Queue" panel to the team dashboard's sprint cockpit that shows, per open PR, whose court the ball is in (waiting for author / waiting for reviewer / no reviewer) sorted oldest-activity-first.

**Architecture:** Backend enriches the existing member-PR GraphQL fetch (new fields + a second `review-requested:` search), a new pure service `computeReviewQueue` derives each PR's triage state, the dashboard route returns it as `reviewQueue`, and a new `ReviewQueuePanel` React component renders it inside the existing cockpit tab (rides the existing `useTeamDashboard` fetch — no new endpoint or hook).

**Tech Stack:** TypeScript, Express, GitHub GraphQL, React, Bootstrap 5 utility classes, `@tabler/icons-react`, Vitest (node for services, jsdom + React Testing Library for components).

**Spec:** `docs/superpowers/specs/2026-08-24-review-queue-design.md`

## Global Constraints

- **No new dependencies.** No chart lib, no table lib — plain `<table>` + Bootstrap classes, as the sibling cockpit panels do.
- **Keep the existing `RawPR` scalar fields** `first_review_at`, `review_state`, `review_requested` — `risk.ts` and `prFlow.ts` read them. New structured fields are added alongside, not in place of them.
- **Bots and teams never count as a person reviewer.** A review whose author `__typename === "Bot"`, or a review *request* whose `__typename === "Team"`, does not make a PR "have a reviewer".
- **Open PRs only** appear in the queue (`state === "open"`). Merged/closed are excluded from the queue but still flow to the other services.
- **Server tests:** `cd server && yarn test`. **Frontend tests:** `yarn test` (from repo root). Both are `vitest run`.
- **Server typecheck** (no tsc build script exists): `cd server && npx tsc --noEmit -p tsconfig.json`.
- **Branch first:** we are on `master`. Before Task 1, run `git checkout -b feat/review-queue`.
- **Every commit message ends with the trailer:**
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: `computeReviewQueue` state machine (backend, pure)

The core triage logic. Pure and total — no I/O, no `now` needed (sort is by `updatedAt`, states are relative). Also adds the shared types it needs.

**Files:**
- Modify: `server/src/services/teamAggregation.ts` (extend `RawPR`, add `RawReview`, `RawReviewRequest`)
- Modify: `server/src/services/dashboard/types.ts` (add `ReviewQueueEntry`)
- Create: `server/src/services/dashboard/reviewQueue.ts`
- Test: `server/src/services/dashboard/reviewQueue.test.ts`

**Interfaces:**
- Consumes: `RawPR` (extended below).
- Produces:
  - `interface RawReview { login: string; typename: string; state: string; submittedAt: string | null }`
  - `interface RawReviewRequest { typename: string; login: string }` (for a `Team`, `login` holds the team name; it is filtered out anyway)
  - `RawPR` gains: `updatedAt?: string | null; isDraft?: boolean; reviewDecision?: string | null; lastCommitAt?: string | null; reviews?: RawReview[]; requestedReviewers?: RawReviewRequest[]`
  - `interface ReviewQueueEntry { number: number; repo_full_name: string; title: string; html_url: string; author: string; state: "author" | "reviewer" | "none"; reason: string; reviewers: string[]; checks_status: string | null; createdAt: string | null; updatedAt: string | null }`
  - `computeReviewQueue(prs: RawPR[]): ReviewQueueEntry[]`

- [ ] **Step 1: Extend `RawPR` and add review sub-types**

In `server/src/services/teamAggregation.ts`, add these two interfaces just above `export interface RawPR {` (line 20):

```ts
export interface RawReview {
  login: string;
  /** GraphQL __typename of the review author: "User" | "Bot" | ... */
  typename: string;
  /** APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED | PENDING */
  state: string;
  submittedAt: string | null;
}

export interface RawReviewRequest {
  /** GraphQL __typename of the requested reviewer: "User" | "Team" | ... */
  typename: string;
  /** User login, or the team name when typename === "Team". */
  login: string;
}
```

Then add these fields inside `RawPR` (after the existing `body?: string;` line, keeping all current fields):

```ts
  /** ISO timestamp of the PR's last activity (GitHub updatedAt) — the queue sort key. */
  updatedAt?: string | null;
  isDraft?: boolean;
  /** GitHub's own rollup: APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | null */
  reviewDecision?: string | null;
  /** committedDate of the PR's last commit — the author's most recent action (lean model). */
  lastCommitAt?: string | null;
  /** Full review list (person + bot); the queue filters bots out itself. */
  reviews?: RawReview[];
  /** Outstanding review requests (users + teams); the queue filters teams out itself. */
  requestedReviewers?: RawReviewRequest[];
```

- [ ] **Step 2: Add `ReviewQueueEntry` to dashboard types**

Append to `server/src/services/dashboard/types.ts`:

```ts
/** One row of the Review Queue: an open PR and whose court the ball is in. */
export interface ReviewQueueEntry {
  number: number;
  repo_full_name: string;
  title: string;
  html_url: string;
  author: string;
  /** author = 🔵 waiting on author, reviewer = 🟡 waiting on reviewer, none = 🔴 no reviewer. */
  state: "author" | "reviewer" | "none";
  reason: string;
  /** Persons who reviewed (most recent first), then persons with an open request. */
  reviewers: string[];
  checks_status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
```

- [ ] **Step 3: Write the failing test file**

Create `server/src/services/dashboard/reviewQueue.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeReviewQueue } from "./reviewQueue";
import type { RawPR } from "../teamAggregation";

function mkPr(overrides: Partial<RawPR>): RawPR {
  return {
    number: 1,
    title: "OPAL-1: thing",
    repo_full_name: "org/repo",
    html_url: "https://github.com/org/repo/pull/1",
    state: "open",
    checks_status: null,
    author: "alice",
    created_at: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    isDraft: false,
    reviewDecision: null,
    lastCommitAt: "2026-08-01T00:00:00Z",
    reviews: [],
    requestedReviewers: [],
    ...overrides,
  };
}
const userReq = (login: string): RawPR["requestedReviewers"] => [{ typename: "User", login }];

describe("computeReviewQueue", () => {
  it("rule 1: draft -> author/draft", () => {
    const [e] = computeReviewQueue([mkPr({ isDraft: true, requestedReviewers: userReq("bob") })]);
    expect(e.state).toBe("author");
    expect(e.reason).toBe("draft");
  });

  it("rule 2: no reviewer requested and none engaged -> none", () => {
    const [e] = computeReviewQueue([mkPr({})]);
    expect(e.state).toBe("none");
    expect(e.reason).toBe("no reviewer assigned");
  });

  it("rule 3: changes requested -> author", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviewDecision: "CHANGES_REQUESTED",
        reviews: [{ login: "bob", typename: "User", state: "CHANGES_REQUESTED", submittedAt: "2026-08-02T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("author");
    expect(e.reason).toBe("changes requested");
  });

  it("rule 4: reviewer acted after author, not approved -> author/awaiting author", () => {
    const [e] = computeReviewQueue([
      mkPr({
        lastCommitAt: "2026-08-01T00:00:00Z",
        reviews: [{ login: "bob", typename: "User", state: "COMMENTED", submittedAt: "2026-08-03T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("author");
    expect(e.reason).toBe("reviewer reviewed, awaiting author");
  });

  it("rule 4: approved and reviewer acted last -> ready to merge", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviewDecision: "APPROVED",
        lastCommitAt: "2026-08-01T00:00:00Z",
        reviews: [{ login: "bob", typename: "User", state: "APPROVED", submittedAt: "2026-08-03T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("author");
    expect(e.reason).toBe("approved — ready to merge");
  });

  it("rule 5: approved but author pushed after -> still ready to merge", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviewDecision: "APPROVED",
        lastCommitAt: "2026-08-05T00:00:00Z",
        reviews: [{ login: "bob", typename: "User", state: "APPROVED", submittedAt: "2026-08-03T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("author");
    expect(e.reason).toBe("approved — ready to merge");
  });

  it("rule 6: engaged, author committed last -> reviewer/awaiting re-review", () => {
    const [e] = computeReviewQueue([
      mkPr({
        lastCommitAt: "2026-08-05T00:00:00Z",
        reviews: [{ login: "bob", typename: "User", state: "COMMENTED", submittedAt: "2026-08-03T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("reviewer");
    expect(e.reason).toBe("author responded, awaiting re-review");
  });

  it("rule 7: requested, nobody engaged -> reviewer/awaiting first review", () => {
    const [e] = computeReviewQueue([mkPr({ requestedReviewers: userReq("bob") })]);
    expect(e.state).toBe("reviewer");
    expect(e.reason).toBe("awaiting first review");
  });

  it("a bot review does not count as engagement", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviews: [{ login: "github-actions", typename: "Bot", state: "COMMENTED", submittedAt: "2026-08-03T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("none");
  });

  it("a team-only review request does not count as a reviewer", () => {
    const [e] = computeReviewQueue([
      mkPr({ requestedReviewers: [{ typename: "Team", login: "cmp-ui" }] }),
    ]);
    expect(e.state).toBe("none");
  });

  it("reviewers list has engaged persons first, then pending requests, bots/teams excluded", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviews: [
          { login: "bob", typename: "User", state: "COMMENTED", submittedAt: "2026-08-02T00:00:00Z" },
          { login: "carol", typename: "User", state: "APPROVED", submittedAt: "2026-08-04T00:00:00Z" },
          { login: "ci", typename: "Bot", state: "COMMENTED", submittedAt: "2026-08-05T00:00:00Z" },
        ],
        requestedReviewers: [{ typename: "User", login: "dave" }, { typename: "Team", login: "cmp-ui" }],
      }),
    ]);
    // carol reviewed most recently, then bob, then still-pending dave; no ci, no team
    expect(e.reviewers).toEqual(["carol", "bob", "dave"]);
  });

  it("excludes non-open PRs", () => {
    const out = computeReviewQueue([mkPr({ state: "merged" }), mkPr({ number: 2, state: "closed" })]);
    expect(out).toHaveLength(0);
  });

  it("sorts oldest-activity-first (ascending updatedAt)", () => {
    const out = computeReviewQueue([
      mkPr({ number: 1, updatedAt: "2026-08-10T00:00:00Z", requestedReviewers: userReq("bob") }),
      mkPr({ number: 2, updatedAt: "2026-08-01T00:00:00Z", requestedReviewers: userReq("bob") }),
    ]);
    expect(out.map((e) => e.number)).toEqual([2, 1]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd server && yarn test src/services/dashboard/reviewQueue.test.ts`
Expected: FAIL — `computeReviewQueue` is not defined / module not found.

- [ ] **Step 5: Implement `computeReviewQueue`**

Create `server/src/services/dashboard/reviewQueue.ts`:

```ts
/**
 * Review Queue: per open PR, decide whose court the ball is in and why.
 * Pure — no I/O. Lean model: "engaged" means a person submitted a review
 * (comments are not fetched); the author's last action is their last commit.
 * Bots (__typename "Bot") and Team review requests never count as a reviewer.
 */
import type { RawPR, RawReview, RawReviewRequest } from "../teamAggregation";
import type { ReviewQueueEntry } from "./types";

/** v1 ignore list. Bots are excluded structurally via __typename, not by login. */
const IGNORED_LOGINS = new Set<string>();

function ms(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : t;
}

function isPersonReview(r: RawReview, author: string): boolean {
  return r.typename === "User" && r.login !== author && !IGNORED_LOGINS.has(r.login);
}

function buildReviewers(personReviews: RawReview[], personRequests: RawReviewRequest[]): string[] {
  const reviewed = [...personReviews]
    .sort((a, b) => (ms(b.submittedAt) || 0) - (ms(a.submittedAt) || 0))
    .map((r) => r.login);
  const uniqueReviewed = [...new Set(reviewed)];
  const reviewedSet = new Set(uniqueReviewed);
  const pending = [...new Set(personRequests.map((q) => q.login))].filter((l) => !reviewedSet.has(l));
  return [...uniqueReviewed, ...pending];
}

function toEntry(pr: RawPR): ReviewQueueEntry {
  const author = pr.author;
  const reviews = pr.reviews ?? [];
  const requests = pr.requestedReviewers ?? [];
  const personReviews = reviews.filter((r) => isPersonReview(r, author));
  const personRequests = requests.filter((q) => q.typename === "User");

  const engaged = personReviews.length > 0;
  const hasReviewer = engaged || personRequests.length > 0;

  const reviewerLastActedAt = personReviews.reduce<number>((max, r) => {
    const t = ms(r.submittedAt);
    return Number.isNaN(t) ? max : Math.max(max, t);
  }, -Infinity);
  const authorCreated = ms(pr.created_at);
  const authorCommit = ms(pr.lastCommitAt);
  const authorLastActedAt = Math.max(
    Number.isNaN(authorCommit) ? -Infinity : authorCommit,
    Number.isNaN(authorCreated) ? -Infinity : authorCreated,
  );
  const approved = pr.reviewDecision === "APPROVED";

  let state: ReviewQueueEntry["state"];
  let reason: string;
  if (pr.isDraft) {
    state = "author";
    reason = "draft";
  } else if (!hasReviewer) {
    state = "none";
    reason = "no reviewer assigned";
  } else if (pr.reviewDecision === "CHANGES_REQUESTED") {
    state = "author";
    reason = "changes requested";
  } else if (engaged && reviewerLastActedAt > authorLastActedAt) {
    state = "author";
    reason = approved ? "approved — ready to merge" : "reviewer reviewed, awaiting author";
  } else if (approved) {
    state = "author";
    reason = "approved — ready to merge";
  } else if (engaged) {
    state = "reviewer";
    reason = "author responded, awaiting re-review";
  } else {
    state = "reviewer";
    reason = "awaiting first review";
  }

  return {
    number: pr.number,
    repo_full_name: pr.repo_full_name,
    title: pr.title,
    html_url: pr.html_url,
    author,
    state,
    reason,
    reviewers: buildReviewers(personReviews, personRequests),
    checks_status: pr.checks_status,
    createdAt: pr.created_at ?? null,
    updatedAt: pr.updatedAt ?? null,
  };
}

export function computeReviewQueue(prs: RawPR[]): ReviewQueueEntry[] {
  return prs
    .filter((p) => p.state === "open")
    .map(toEntry)
    .sort((a, b) => (ms(a.updatedAt) || 0) - (ms(b.updatedAt) || 0));
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd server && yarn test src/services/dashboard/reviewQueue.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**

```bash
git add server/src/services/teamAggregation.ts server/src/services/dashboard/types.ts server/src/services/dashboard/reviewQueue.ts server/src/services/dashboard/reviewQueue.test.ts
git commit -m "feat(cockpit): add computeReviewQueue triage state machine

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: PR fetch enrichment (backend I/O)

Add the GraphQL fields the state machine needs, extract the node mapper + a dedupe helper as pure/testable functions, and add the second `review-requested:` search so PRs the team is assigned to review are included.

**Files:**
- Create: `server/src/services/dashboard/prFetch.ts` (pure: `mapPullRequestNode`, `dedupePRs`)
- Test: `server/src/services/dashboard/prFetch.test.ts`
- Modify: `server/src/routes/teams.ts` (enrich `MEMBER_PRS_QUERY` at line 151; rewrite `fetchMemberPRs` at line 175 to use the helpers + run both searches)

**Interfaces:**
- Consumes: `RawPR`, `RawReview`, `RawReviewRequest` from Task 1.
- Produces:
  - `mapPullRequestNode(n: any, fallbackLogin: string): RawPR`
  - `dedupePRs(prs: RawPR[]): RawPR[]` — keeps first occurrence per `repo_full_name#number`.

- [ ] **Step 1: Write the failing test file**

Create `server/src/services/dashboard/prFetch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapPullRequestNode, dedupePRs } from "./prFetch";
import type { RawPR } from "../teamAggregation";

const node = {
  number: 7,
  title: "OPAL-7: thing",
  url: "https://github.com/org/repo/pull/7",
  state: "OPEN",
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-04T00:00:00Z",
  mergedAt: null,
  headRefName: "feat/x",
  body: "body",
  isDraft: true,
  reviewDecision: "CHANGES_REQUESTED",
  author: { login: "carol" },
  repository: { nameWithOwner: "org/repo" },
  commits: { nodes: [{ commit: { committedDate: "2026-08-03T00:00:00Z", statusCheckRollup: { state: "FAILURE" } } }] },
  reviews: {
    nodes: [
      { author: { login: "bob", __typename: "User" }, state: "CHANGES_REQUESTED", submittedAt: "2026-08-02T00:00:00Z" },
      { author: { login: "ci", __typename: "Bot" }, state: "COMMENTED", submittedAt: "2026-08-02T06:00:00Z" },
    ],
  },
  reviewRequests: {
    totalCount: 2,
    nodes: [
      { requestedReviewer: { __typename: "User", login: "dave" } },
      { requestedReviewer: { __typename: "Team", name: "cmp-ui" } },
    ],
  },
};

describe("mapPullRequestNode", () => {
  it("maps new + legacy fields", () => {
    const pr = mapPullRequestNode(node, "fallback");
    expect(pr.number).toBe(7);
    expect(pr.repo_full_name).toBe("org/repo");
    expect(pr.state).toBe("open");
    expect(pr.author).toBe("carol");
    expect(pr.updatedAt).toBe("2026-08-04T00:00:00Z");
    expect(pr.isDraft).toBe(true);
    expect(pr.reviewDecision).toBe("CHANGES_REQUESTED");
    expect(pr.lastCommitAt).toBe("2026-08-03T00:00:00Z");
    expect(pr.checks_status).toBe("FAILURE");
    // structured reviews carry typename
    expect(pr.reviews).toEqual([
      { login: "bob", typename: "User", state: "CHANGES_REQUESTED", submittedAt: "2026-08-02T00:00:00Z" },
      { login: "ci", typename: "Bot", state: "COMMENTED", submittedAt: "2026-08-02T06:00:00Z" },
    ]);
    expect(pr.requestedReviewers).toEqual([
      { typename: "User", login: "dave" },
      { typename: "Team", login: "cmp-ui" },
    ]);
    // legacy scalars preserved
    expect(pr.first_review_at).toBe("2026-08-02T00:00:00Z");
    expect(pr.review_state).toBe("CHANGES_REQUESTED");
    expect(pr.review_requested).toBe(true);
  });

  it("uses fallbackLogin only when author is missing", () => {
    const pr = mapPullRequestNode({ ...node, author: null }, "fallback");
    expect(pr.author).toBe("fallback");
  });
});

describe("dedupePRs", () => {
  it("unions by repo#number, keeping the first occurrence, incl. external-author PRs", () => {
    const a: RawPR = { number: 1, title: "t", repo_full_name: "org/repo", html_url: "u", state: "open", checks_status: null, author: "alice", created_at: "2026-08-01T00:00:00Z" };
    const dup: RawPR = { ...a, title: "dup-should-be-dropped" };
    const external: RawPR = { ...a, number: 2, author: "outsider" };
    const out = dedupePRs([a, dup, external]);
    expect(out).toHaveLength(2);
    expect(out.find((p) => p.number === 1)?.title).toBe("t");
    expect(out.find((p) => p.number === 2)?.author).toBe("outsider");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && yarn test src/services/dashboard/prFetch.test.ts`
Expected: FAIL — module `./prFetch` not found.

- [ ] **Step 3: Implement the pure helpers**

Create `server/src/services/dashboard/prFetch.ts`:

```ts
/**
 * Pure mapping helpers for the member-PR GraphQL fetch. Kept out of the route
 * file so they can be unit-tested without importing Express/DB/graphql clients.
 */
import type { RawPR, RawReview, RawReviewRequest } from "../teamAggregation";

/** Map a GraphQL PullRequest node to RawPR (new fields + preserved legacy scalars). */
export function mapPullRequestNode(n: any, fallbackLogin: string): RawPR {
  const reviewNodes: any[] = n.reviews?.nodes || [];
  const reviews: RawReview[] = reviewNodes.map((r) => ({
    login: r.author?.login || "",
    typename: r.author?.__typename || "",
    state: r.state || "",
    submittedAt: r.submittedAt || null,
  }));

  // Legacy scalars — risk.ts / prFlow.ts still read these.
  let first_review_at: string | null = null;
  let review_state: string | null = null;
  if (reviewNodes.length > 0) {
    const sorted = [...reviewNodes].sort(
      (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
    );
    first_review_at = sorted[0].submittedAt;
    const hasChanges = reviewNodes.some((r) => r.state === "CHANGES_REQUESTED");
    const hasApproved = reviewNodes.some((r) => r.state === "APPROVED");
    review_state = hasChanges ? "CHANGES_REQUESTED" : hasApproved ? "APPROVED" : "COMMENTED";
  } else if ((n.reviewRequests?.totalCount || 0) > 0) {
    review_state = "REVIEW_REQUIRED";
  }

  const requestedReviewers: RawReviewRequest[] = (n.reviewRequests?.nodes || []).map((rr: any) => {
    const rev = rr.requestedReviewer || {};
    return { typename: rev.__typename || "", login: rev.login || rev.name || "" };
  });

  return {
    number: n.number,
    title: n.title,
    repo_full_name: n.repository?.nameWithOwner || "",
    html_url: n.url,
    state: (n.state || "").toLowerCase(),
    checks_status: n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state || null,
    author: n.author?.login || fallbackLogin,
    created_at: n.createdAt,
    updatedAt: n.updatedAt || null,
    merged_at: n.mergedAt || null,
    isDraft: !!n.isDraft,
    reviewDecision: n.reviewDecision || null,
    lastCommitAt: n.commits?.nodes?.[0]?.commit?.committedDate || null,
    first_review_at,
    review_state,
    review_requested: (n.reviewRequests?.totalCount || 0) > 0,
    reviews,
    requestedReviewers,
    head_ref: n.headRefName || "",
    body: n.body || "",
  };
}

/** Union PRs, keeping the first occurrence per repo_full_name#number. */
export function dedupePRs(prs: RawPR[]): RawPR[] {
  const seen = new Map<string, RawPR>();
  for (const pr of prs) {
    const k = `${pr.repo_full_name}#${pr.number}`;
    if (!seen.has(k)) seen.set(k, pr);
  }
  return [...seen.values()];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && yarn test src/services/dashboard/prFetch.test.ts`
Expected: PASS.

- [ ] **Step 5: Enrich the GraphQL query**

In `server/src/routes/teams.ts`, replace the `MEMBER_PRS_QUERY` body (lines 151-166) with:

```ts
const MEMBER_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 30) {
      nodes {
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
      }
    }
  }
`;
```

- [ ] **Step 6: Rewrite `fetchMemberPRs` to use the helpers and both searches**

Add this import near the other service imports at the top of `server/src/routes/teams.ts`:

```ts
import { mapPullRequestNode, dedupePRs } from "../services/dashboard/prFetch";
```

Replace the whole `fetchMemberPRs` function (lines 175-231) with:

```ts
async function runSearch(q: string, fallbackLogin: string): Promise<RawPR[]> {
  try {
    const data = await graphql<{ search: { nodes: any[] } }>(MEMBER_PRS_QUERY, { q });
    return (data.search.nodes || []).map((n: any) => mapPullRequestNode(n, fallbackLogin));
  } catch {
    return [];
  }
}

/**
 * Fetch each member's PRs in batches: PRs they authored (last 2 weeks) plus open
 * PRs where they are a requested reviewer (any author, any age). Deduped by
 * repo#number so a PR the team both authored and reviews appears once.
 */
async function fetchMemberPRs(roster: RosterEntry[]): Promise<RawPR[]> {
  const since = twoWeeksAgoISO();
  const batchSize = 5;
  const all: RawPR[] = [];
  for (let i = 0; i < roster.length; i += batchSize) {
    const batch = roster.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.flatMap((m) => [
        runSearch(`author:${m.githubUsername} type:pr created:>=${since}`, m.githubUsername),
        runSearch(`review-requested:${m.githubUsername} type:pr state:open`, ""),
      ]),
    );
    for (const r of results) all.push(...r);
  }
  return dedupePRs(all);
}
```

Note: the inline review-rollup logic that used to live in `fetchMemberPRs` now lives in `mapPullRequestNode` — delete the old body entirely; do not leave the old mapping behind.

- [ ] **Step 7: Verify typecheck + full server suite**

Run: `cd server && npx tsc --noEmit -p tsconfig.json && yarn test`
Expected: no type errors; all server tests pass (existing `risk`/`prFlow`/etc. still green because the legacy scalar fields are preserved).

- [ ] **Step 8: Commit**

```bash
git add server/src/services/dashboard/prFetch.ts server/src/services/dashboard/prFetch.test.ts server/src/routes/teams.ts
git commit -m "feat(cockpit): enrich PR fetch and add review-requested search

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire `reviewQueue` into the dashboard response (backend)

Expose the queue on the API payload the frontend already consumes.

**Files:**
- Modify: `server/src/routes/teams.ts` (import `computeReviewQueue`; add field to the `res.json` at line 437)

**Interfaces:**
- Consumes: `computeReviewQueue` (Task 1), the `prs` array already built at `teams.ts:388`.
- Produces: `reviewQueue: ReviewQueueEntry[]` on the dashboard JSON response.

- [ ] **Step 1: Import the service**

Add near the other dashboard-service imports at the top of `server/src/routes/teams.ts`:

```ts
import { computeReviewQueue } from "../services/dashboard/reviewQueue";
```

- [ ] **Step 2: Add the field to the response**

In the `res.json({ ... })` object (starts at `teams.ts:437`), add this line next to `prFlow,` / `hygiene,`:

```ts
    reviewQueue: computeReviewQueue(prs),
```

(`prs` is already in scope — it's the deduped array from `fetchMemberPRs`.)

- [ ] **Step 3: Verify typecheck + server suite still green**

Run: `cd server && npx tsc --noEmit -p tsconfig.json && yarn test`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/teams.ts
git commit -m "feat(cockpit): return reviewQueue in team dashboard response

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `ReviewQueuePanel` component + cockpit wiring (frontend)

Mirror the type on the frontend, render the panel in the cockpit tab, and keep the fixture valid.

**Files:**
- Modify: `src/types/teams.ts` (add `ReviewQueueEntry`; add `reviewQueue` to `TeamDashboard` at line 219)
- Create: `src/views/teams/cockpit/ReviewQueuePanel.tsx`
- Test: `src/views/teams/cockpit/ReviewQueuePanel.test.tsx`
- Modify: `src/views/teams/__fixtures__/dashboardFixture.ts` (add `reviewQueue`)
- Modify: `src/views/teams/TeamDashboardView.tsx` (import + render the panel)

**Interfaces:**
- Consumes: `ReviewQueueEntry[]` from `dashboard.reviewQueue`; `openPR(repoFullName, number)` already defined in `TeamDashboardView` (line 162).
- Produces: `<ReviewQueuePanel entries={ReviewQueueEntry[]} onOpenPR?={(repo, number) => void} />`.

- [ ] **Step 1: Add the frontend type and dashboard field**

In `src/types/teams.ts`, add this interface (place it just above `export interface TeamDashboard {` at line 219):

```ts
/** One row of the Review Queue — mirrors the backend ReviewQueueEntry. */
export interface ReviewQueueEntry {
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

Then add this field inside `TeamDashboard` (after `hygiene: Hygiene;` at line 232):

```ts
  reviewQueue: ReviewQueueEntry[];
```

- [ ] **Step 2: Add `reviewQueue` to the fixture**

In `src/views/teams/__fixtures__/dashboardFixture.ts`, add this property to the `dashboardFixture` object (after the `hygiene: {...}` block, before `burnup:`):

```ts
  reviewQueue: [
    {
      number: 12,
      repo_full_name: "acme/web",
      title: "PLAT-101 health strip",
      html_url: "https://github.com/acme/web/pull/12",
      author: "tashfia",
      state: "reviewer",
      reason: "awaiting first review",
      reviewers: ["nadman"],
      checks_status: "FAILURE",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    },
    {
      number: 88,
      repo_full_name: "acme/web",
      title: "hotfix: logging",
      html_url: "https://github.com/acme/web/pull/88",
      author: "nadman",
      state: "none",
      reason: "no reviewer assigned",
      reviewers: [],
      checks_status: null,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:00.000Z",
    },
  ],
```

- [ ] **Step 3: Write the failing component test**

Create `src/views/teams/cockpit/ReviewQueuePanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReviewQueuePanel } from "./ReviewQueuePanel";
import type { ReviewQueueEntry } from "../../../types/teams";

const entries: ReviewQueueEntry[] = [
  {
    number: 12,
    repo_full_name: "acme/web",
    title: "PLAT-101 health strip",
    html_url: "https://github.com/acme/web/pull/12",
    author: "tashfia",
    state: "none",
    reason: "no reviewer assigned",
    reviewers: [],
    checks_status: "FAILURE",
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
  {
    number: 20,
    repo_full_name: "acme/web",
    title: "PLAT-102 token refresh",
    html_url: "https://github.com/acme/web/pull/20",
    author: "nadman",
    state: "author",
    reason: "changes requested",
    reviewers: ["carol"],
    checks_status: "SUCCESS",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
  },
];

describe("ReviewQueuePanel", () => {
  it("renders a row per entry with title link, reason, author, reviewers, and state label", () => {
    render(<ReviewQueuePanel entries={entries} />);
    expect(screen.getByText(/REVIEW QUEUE · 2/)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /PLAT-101 health strip/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/web/pull/12");

    expect(screen.getByText("no reviewer assigned")).toBeInTheDocument();
    expect(screen.getByText("changes requested")).toBeInTheDocument();
    expect(screen.getByText("tashfia")).toBeInTheDocument();
    expect(screen.getByText("carol")).toBeInTheDocument();
    expect(screen.getByText("No reviewer")).toBeInTheDocument();
    expect(screen.getByText("Author")).toBeInTheDocument();
  });

  it("renders an empty state when there are no entries", () => {
    render(<ReviewQueuePanel entries={[]} />);
    expect(screen.getByText("No open PRs.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `yarn test src/views/teams/cockpit/ReviewQueuePanel.test.tsx`
Expected: FAIL — module `./ReviewQueuePanel` not found.

- [ ] **Step 5: Implement the panel**

Create `src/views/teams/cockpit/ReviewQueuePanel.tsx`:

```tsx
import { formatRelativeTime } from "../../../utils/time";
import type { ReviewQueueEntry } from "../../../types/teams";

interface Props {
  entries: ReviewQueueEntry[];
  onOpenPR?: (repoFullName: string, number: number) => void;
}

const STATE_META: Record<
  ReviewQueueEntry["state"],
  { dot: string; label: string; className: string }
> = {
  author: { dot: "🔵", label: "Author", className: "text-primary" },
  reviewer: { dot: "🟡", label: "Reviewer", className: "text-warning" },
  none: { dot: "🔴", label: "No reviewer", className: "text-danger" },
};

export function ReviewQueuePanel({ entries, onOpenPR }: Props) {
  return (
    <div className="border rounded p-2">
      <div className="small text-muted mb-2">REVIEW QUEUE · {entries.length}</div>
      {entries.length === 0 ? (
        <div className="text-muted small">No open PRs.</div>
      ) : (
        <table className="table table-sm table-hover mb-0">
          <thead>
            <tr className="small text-muted">
              <th>State</th>
              <th>PR</th>
              <th>Author</th>
              <th>Reviewers</th>
              <th>Checks</th>
              <th className="text-nowrap">Age / Activity</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const meta = STATE_META[e.state];
              return (
                <tr
                  key={`${e.repo_full_name}#${e.number}`}
                  onClick={onOpenPR ? () => onOpenPR(e.repo_full_name, e.number) : undefined}
                  style={onOpenPR ? { cursor: "pointer" } : undefined}
                >
                  <td className={`${meta.className} text-nowrap`}>
                    {meta.dot} <span className="small">{meta.label}</span>
                  </td>
                  <td>
                    <a
                      href={e.html_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      #{e.number} {e.title}
                    </a>
                    <div className="small text-muted">{e.reason}</div>
                  </td>
                  <td className="small text-muted text-nowrap">{e.author}</td>
                  <td className="small text-muted">
                    {e.reviewers.length > 0 ? e.reviewers.join(", ") : "—"}
                  </td>
                  <td className="small text-nowrap">
                    {e.checks_status === "FAILURE" ? (
                      <span className="text-danger">✗</span>
                    ) : e.checks_status === "SUCCESS" ? (
                      <span className="text-success">✓</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="small text-muted text-nowrap">
                    {e.createdAt ? formatRelativeTime(e.createdAt) : "—"} /{" "}
                    {e.updatedAt ? formatRelativeTime(e.updatedAt) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `yarn test src/views/teams/cockpit/ReviewQueuePanel.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 7: Render the panel in the cockpit**

In `src/views/teams/TeamDashboardView.tsx`, add the import next to the other cockpit imports (after line 32, the `DeliveryHygiene` import):

```ts
import { ReviewQueuePanel } from "./cockpit/ReviewQueuePanel";
```

Then insert the panel between the PR-flow/hygiene row (closes at line 305) and the Off-board PRs block (opens at line 307):

```tsx
              <div className="mb-3">
                <ReviewQueuePanel entries={dashboard.reviewQueue} onOpenPR={openPR} />
              </div>
```

- [ ] **Step 8: Verify frontend typecheck + full suites**

Run: `yarn build` (this runs `tsc && vite build`, catching the fixture/type wiring) then `yarn test:all`
Expected: build succeeds; all frontend and server tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/types/teams.ts src/views/teams/cockpit/ReviewQueuePanel.tsx src/views/teams/cockpit/ReviewQueuePanel.test.tsx src/views/teams/__fixtures__/dashboardFixture.ts src/views/teams/TeamDashboardView.tsx
git commit -m "feat(cockpit): render Review Queue panel in the sprint cockpit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual verification (after all tasks)

1. `cd server && yarn dev` and `yarn dev` (frontend), open the app.
2. Team dashboard → pick a team with a board → Sprint tab.
3. Confirm the **Review Queue** panel appears below PR Flow / Delivery Hygiene, listing open PRs oldest-activity-first with a state dot, reason line, author, reviewers, checks, and the `age / activity` pair.
4. Sanity-check states against GitHub: a PR with changes requested shows 🔵 "changes requested"; a PR nobody's assigned shows 🔴 "no reviewer assigned"; a PR where a teammate is a requested reviewer on someone else's PR appears with the external author's login.

## Self-Review (completed by plan author)

- **Spec coverage:** Component 1 (fetch) → Task 2; Component 2 (state machine) → Task 1; Component 3 (types) → Tasks 1 & 4; Component 4 (response wiring) → Task 3; Component 5 (frontend panel) → Task 4; Testing section → tests in every task. All spec sections mapped.
- **Placeholder scan:** none — every code and test step is concrete.
- **Type consistency:** `RawReview`/`RawReviewRequest`/`RawPR` extensions (Task 1) match their use in `prFetch.ts` (Task 2) and `reviewQueue.ts` (Task 1); `ReviewQueueEntry` is identical in `server/.../types.ts` (Task 1) and `src/types/teams.ts` (Task 4); `computeReviewQueue(prs)` signature matches its call site (Task 3); `onOpenPR` matches `openPR(repoFullName, number)` in `TeamDashboardView`.
