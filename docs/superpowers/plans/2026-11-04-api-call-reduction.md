# API Call Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the GitHub and Jira calls Dev Home makes. Workday loads and polls fetch only what they show, and nothing is fetched twice.

**Architecture:** Five independent cuts, built smallest first:
- required-checks TTL
- one shared merged-PR list
- Standup-only data on demand
- one Jira query for assigned tickets
- GitHub mentions: a saved cache plus one batched GraphQL open-state check

Each cut ships with call-count tests on the existing `httpMock` fetch adapter.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library, GitHub REST/GraphQL, Jira REST (via `/jira-proxy`).

**Spec:** `docs/superpowers/specs/2026-11-04-api-call-reduction-design.md`

## Global Constraints

- Run tests with `NODE_ENV=test` in front. The shell exports `NODE_ENV=production`, and vitest mass-fails on `act()` without it. Example: `NODE_ENV=test yarn vitest run src/api/github/index.test.ts`.
- No Playwright or browser automation. The app needs real tokens. Verify with tests; the user checks the UI by eye.
- Comments explain *why*, in the repo's existing voice. Match the surrounding code style (2-space indent, double quotes, trailing commas).
- Work on branch `feat/api-call-reduction`, never on `master`.
- End every commit message with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Before the last commit: `NODE_ENV=test yarn test`, `yarn lint` and `yarn typecheck` all pass.

## File Map

| File | Change |
|---|---|
| `src/api/github/requiredContexts.ts` | TTL 10 min → 24 h (Task 1) |
| `src/services/github.ts` | `MY_MERGED_DAYS`, `fetchMyMergedPRs`, `mergedSince` (Task 2) |
| `src/services/workday.ts` | stable group uses the shared merged list (Task 2); `AssignedIssues`, `sprintParts`; stable group is merged-only (Task 4) |
| `src/hooks/useWorkdayExtras.ts` | derives `merged` (Task 2); `needsDone` gate (Task 3); derives sprint/off-sprint (Task 4) |
| `src/views/prs/PRsView.tsx` | Recently Merged reads the shared list (Task 2) |
| `src/views/workday/WorkdayView.tsx` | passes `needsDone` (Task 3); `assignedLoaded` prop + `assigned` (Task 4) |
| `src/App.tsx` | passes `assignedLoaded` (Task 4) |
| `src/types.ts` | `JiraIssue.openSprint/points/flagged` (Task 4) |
| `src/api/jira/issues.ts` | one assigned query with sprint fields; `sprintNameOf`, `isFlagged` move here (Task 4) |
| `src/api/jira/workday.ts`, `src/api/jira/index.ts` | drop `getSprintTickets`, `getOffSprintTickets` (Task 4) |
| `src/api/github/notifications.ts` | saved cache (Task 5); batched open-state check (Task 6) |
| `src/api/github/index.ts` | hydrate/save around mentions (Task 5); new `filterOpenNotifications` call (Task 6) |
| `src/api/http/github.ts` | `githubGraphql` `allowPartial` option (Task 6) |
| `src/api/github/queries.ts` | `buildSubjectStatesQuery` (Task 6) |

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/api-call-reduction
```

---

### Task 1: Required checks cached for a day

**Files:**
- Modify: `src/api/github/requiredContexts.ts:16`
- Test: `src/api/github/index.test.ts` (describe `"required contexts cache"`, ~line 235)

**Interfaces:** none (internal constant).

- [ ] **Step 1: Write the failing tests**

In `src/api/github/index.test.ts`, add `afterEach` to the vitest import on line 1:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
```

Inside `describe("required contexts cache", …)`, right after its existing `beforeEach`, add:

```ts
  afterEach(() => vi.useRealTimers());

  it("serves an answer persisted 23 hours ago without a network call", async () => {
    persisted("testuser", ["ci"], Date.now() - 23 * 60 * 60 * 1000);
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(0);
  });

  it("asks again only once a fetched answer is a day old", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    vi.setSystemTime(new Date("2026-11-05T08:59:00Z"));
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(1);
    vi.setSystemTime(new Date("2026-11-05T09:01:00Z"));
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(2);
  });
```

`persisted` is declared further down in the same describe, as a function declaration, so it's hoisted. These tests can sit anywhere inside the describe.

In the existing test `"answers from a stale persisted entry and refreshes it in the background"`, change the age from one hour to 25 hours:

```ts
    const at = Date.now() - 25 * 60 * 60 * 1000;
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_ENV=test yarn vitest run src/api/github/index.test.ts -t "required contexts"`
Expected: FAIL. "serves an answer persisted 23 hours ago" gets `protectionCalls()` 1, not 0. "asks again only once a fetched answer is a day old" gets 2, not 1, at 08:59.

- [ ] **Step 3: Raise the TTL**

In `src/api/github/requiredContexts.ts`, replace line 16:

```ts
const REQUIRED_CONTEXTS_TTL_MS = 10 * 60 * 1000; // 10 minutes
```

with:

```ts
// Branch protection rarely changes, and each lookup costs two REST calls per
// repo@branch, so an answer is trusted for a day (a settings save clears it).
const REQUIRED_CONTEXTS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `NODE_ENV=test yarn vitest run src/api/github/index.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/api/github/requiredContexts.ts src/api/github/index.test.ts
git commit -m "perf(github): trust required-check answers for a day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: One merged-PR list

**Files:**
- Modify: `src/services/github.ts` (list cache ~line 30; add after `fetchRecentlyMergedPRs`, ~line 122)
- Modify: `src/services/workday.ts`
- Modify: `src/hooks/useWorkdayExtras.ts`
- Modify: `src/views/prs/PRsView.tsx` (~lines 4, 255–281)
- Test: `src/services/github.test.ts`, `src/services/workday.test.ts`, `src/hooks/useWorkdayExtras.test.ts`, `src/views/prs/PRsView.test.tsx`

**Interfaces:**
- Produces (`src/services/github.ts`):
  - `export const MY_MERGED_DAYS = 60`
  - `export function fetchMyMergedPRs(refreshKey: number, now?: Date): Promise<GitHubPR[]>`
  - `export function mergedSince(prs: GitHubPR[], since: Date): GitHubPR[]`
- Produces (`src/services/workday.ts`):
  - `fetchWorkdayStable(refreshKey: number, signal?: AbortSignal, now?: Date): Promise<StableParts>`
  - `fetchWorkdaySince(since: Date, signal?: AbortSignal): Promise<{ doneTickets; reviewed }>` (no `merged`)
  - `TICKET_MERGED_DAYS` is removed; use `MY_MERGED_DAYS`.
- `useWorkdayExtras` still returns the full `WorkdayExtras`. `merged` is now derived.

- [ ] **Step 1: Write the failing tests for the shared list**

In `src/services/github.test.ts`, add `getMergedPrs` to the `../api/github` import and to the `vi.mock` factory:

```ts
import {
  enqueuePr,
  getMergeOptions,
  getMergedPrs,
  getPrComments,
  mergePr,
  setReviewThreadResolved,
  type MergeOptions,
} from "../api/github";
import {
  clearListCache,
  fetchMergeOptions,
  fetchMyMergedPRs,
  fetchPRComments,
  mergePR,
  mergedSince,
  MY_MERGED_DAYS,
  setPRThreadResolved,
} from "./github";
```

```ts
vi.mock("../api/github", () => ({
  getMergeOptions: vi.fn(),
  getMergedPrs: vi.fn(),
  mergePr: vi.fn(),
  enqueuePr: vi.fn(),
  getPrComments: vi.fn(),
  setReviewThreadResolved: vi.fn(),
}));
```

Append to the end of the file:

```ts
describe("fetchMyMergedPRs", () => {
  beforeEach(() => {
    clearListCache();
    vi.mocked(getMergedPrs).mockReset();
    vi.mocked(getMergedPrs).mockResolvedValue({
      prs: [pr({ merged_at: "2026-11-01T00:00:00Z" })],
    });
  });

  it("searches my PRs merged in the last 60 days, up to 100", async () => {
    const now = new Date("2026-11-04T12:00:00Z");
    await fetchMyMergedPRs(0, now);
    expect(getMergedPrs).toHaveBeenCalledWith({
      scope: "user",
      since: new Date(now.getTime() - MY_MERGED_DAYS * 86_400_000),
      first: 100,
    });
  });

  it("shares one search across callers under the same refreshKey", async () => {
    await fetchMyMergedPRs(0);
    await fetchMyMergedPRs(0);
    expect(getMergedPrs).toHaveBeenCalledTimes(1);
  });

  it("searches again once refreshKey moves on", async () => {
    await fetchMyMergedPRs(0);
    await fetchMyMergedPRs(1);
    expect(getMergedPrs).toHaveBeenCalledTimes(2);
  });

  it("searches again after 5 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
      await fetchMyMergedPRs(0);
      vi.setSystemTime(new Date("2026-11-04T12:05:00Z"));
      await fetchMyMergedPRs(0);
      expect(getMergedPrs).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries after a failed search", async () => {
    vi.mocked(getMergedPrs).mockRejectedValueOnce(new Error("down"));
    await expect(fetchMyMergedPRs(0)).rejects.toThrow("down");
    await fetchMyMergedPRs(0);
    expect(getMergedPrs).toHaveBeenCalledTimes(2);
  });

  it("forgets the list when settings change", async () => {
    await fetchMyMergedPRs(0);
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    await fetchMyMergedPRs(0);
    expect(getMergedPrs).toHaveBeenCalledTimes(2);
  });
});

describe("mergedSince", () => {
  it("keeps PRs merged at or after since", () => {
    const a = pr({ number: 1, merged_at: "2026-11-03T00:00:00Z" });
    const b = pr({ number: 2, merged_at: "2026-11-01T00:00:00Z" });
    const c = pr({ number: 3, merged_at: undefined });
    expect(mergedSince([a, b, c], new Date("2026-11-02T00:00:00Z"))).toEqual([a]);
    expect(mergedSince([a], new Date("2026-11-03T00:00:00Z"))).toEqual([a]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `NODE_ENV=test yarn vitest run src/services/github.test.ts`
Expected: FAIL: `fetchMyMergedPRs is not a function` (and `mergedSince`).

- [ ] **Step 3: Add the shared list**

In `src/services/github.ts`, add the state right after the `listCache` declaration (~line 30), and clear it with the list cache:

```ts
const listCache = new Map<string, { at: number; value: Promise<any> }>();

/**
 * My merged PRs, loaded under a refreshKey (see fetchMyMergedPRs). Kept apart
 * from listCache because a refreshKey bump, not a `force` flag, retires it.
 */
let myMerged: { at: number; refreshKey: number; value: Promise<GitHubPR[]> } | null = null;

if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, () => {
    listCache.clear();
    myMerged = null;
  });
}
```

(This replaces the existing one-line `listCache.clear()` listener.) Also reset it in the test helper:

```ts
/** Test helper: forget every cached list lookup. */
export function clearListCache(): void {
  listCache.clear();
  myMerged = null;
}
```

Right after `fetchRecentlyMergedPRs` (~line 122), add:

```ts
/** How far back my merged PRs are fetched: one list serves every view that shows them. */
export const MY_MERGED_DAYS = 60;
/** GitHub's per-search maximum. */
const MY_MERGED_MAX = 100;

/**
 * My PRs merged in the last MY_MERGED_DAYS: Workday (PRs under tickets, Merged
 * recently, Standup) and My PRs' Recently Merged all read this one list and
 * filter it by date (mergedSince). Whichever view asks first under a
 * refreshKey fetches it for the others; it's kept 5 minutes.
 */
export function fetchMyMergedPRs(refreshKey: number, now: Date = new Date()): Promise<GitHubPR[]> {
  const hit = myMerged;
  if (hit && hit.refreshKey === refreshKey && Date.now() - hit.at < MERGED_TTL_MS) {
    return hit.value;
  }
  const since = new Date(now.getTime() - MY_MERGED_DAYS * 24 * 60 * 60 * 1000);
  const value = getMergedPrs({ scope: "user", since, first: MY_MERGED_MAX }).then(
    (data) => data.prs as GitHubPR[],
  );
  const entry = { at: Date.now(), refreshKey, value };
  myMerged = entry;
  // A failure isn't kept, so the next caller retries.
  value.catch(() => {
    if (myMerged === entry) myMerged = null;
  });
  return value;
}

/** The PRs in `prs` merged at or after `since`. */
export function mergedSince(prs: GitHubPR[], since: Date): GitHubPR[] {
  const from = since.getTime();
  return prs.filter((pr) => !!pr.merged_at && new Date(pr.merged_at).getTime() >= from);
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `NODE_ENV=test yarn vitest run src/services/github.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing Workday service tests**

In `src/services/workday.test.ts`:

1. Keep the `../api/github` mock but drop `getMergedPrs` from it. Add a mock for `./github`:

```ts
vi.mock("../api/github", async (orig) => ({
  ...(await orig<typeof import("../api/github")>()),
  getMergedPrs: vi.fn(),
  getReviewedSince: vi.fn(),
}));
vi.mock("./github", async (orig) => ({
  ...(await orig<typeof import("./github")>()),
  fetchMyMergedPRs: vi.fn(),
}));
```

2. Add `import { fetchMyMergedPRs } from "./github";` and remove `TICKET_MERGED_DAYS` from the `./workday` import.

3. Replace the three tests in `describe("workday service")` with:

```ts
  it("isolates failures per part", async () => {
    vi.mocked(jira.getSprintTickets).mockRejectedValue(new Error("sprint boom"));
    vi.mocked(jira.getOffSprintTickets).mockResolvedValue({ issues: [] });
    vi.mocked(fetchMyMergedPRs).mockResolvedValue([]);
    const stable = await fetchWorkdayStable(0);
    expect(stable.sprint).toEqual({ data: null, error: "sprint boom" });
    expect(stable.offSprint).toEqual({ data: [], error: null });
    expect(stable.ticketMerged).toEqual({ data: [], error: null });
  });

  it("reads the deck's merged PRs from the shared list, under the refreshKey", async () => {
    vi.mocked(jira.getSprintTickets).mockResolvedValue({ tickets: [] } as any);
    vi.mocked(jira.getOffSprintTickets).mockResolvedValue({ issues: [] });
    vi.mocked(fetchMyMergedPRs).mockRejectedValue(new Error("gh down"));
    const now = new Date("2026-10-14T12:00:00Z");
    const stable = await fetchWorkdayStable(3, undefined, now);
    expect(fetchMyMergedPRs).toHaveBeenCalledWith(3, now);
    expect(stable.ticketMerged).toEqual({ data: null, error: "gh down" });
  });

  it("passes since to the since-dependent fetches, and runs no merged search of its own", async () => {
    const since = new Date("2026-10-08T00:00:00Z");
    vi.mocked(jira.getDoneSince).mockResolvedValue({ tickets: [] });
    vi.mocked(gh.getReviewedSince).mockRejectedValue(new Error("gh down"));
    const res = await fetchWorkdaySince(since);
    expect(jira.getDoneSince).toHaveBeenCalledWith(since, undefined);
    expect(gh.getMergedPrs).not.toHaveBeenCalled();
    expect(res).toEqual({
      doneTickets: { data: [], error: null },
      reviewed: { data: null, error: "gh down" },
    });
  });
```

4. In `describe("workday cache")`, change `sinceParts` to:

```ts
  const sinceParts = { doneTickets: ok([]), reviewed: ok([]) };
```

- [ ] **Step 6: Write the failing hook test**

In `src/hooks/useWorkdayExtras.test.ts`:

1. Add `import type { GitHubPR } from "../types";`.

2. In `beforeEach`, change the `fetchWorkdaySince` mock to:

```ts
  vi.mocked(fetchWorkdaySince).mockResolvedValue({
    doneTickets: ok([]),
    reviewed: ok([]),
  });
```

3. Append this test inside `describe("useWorkdayExtras")`:

```ts
  it("derives Merged recently from the ticket list by since, with no request of its own", async () => {
    vi.mocked(fetchWorkdayStable).mockResolvedValue({
      sprint: ok([]),
      offSprint: ok([]),
      ticketMerged: ok([
        { number: 1, merged_at: "2026-10-28T09:00:00Z" },
        { number: 2, merged_at: "2026-10-20T09:00:00Z" },
      ] as GitHubPR[]),
    });
    const { result, rerender } = renderHook((s: Date) => useWorkdayExtras(true, s, 0), {
      initialProps: since,
    });
    await waitFor(() => expect(result.current.merged.data?.map((p) => p.number)).toEqual([1]));
    rerender(new Date("2026-10-19T00:00:00Z"));
    expect(result.current.merged.data?.map((p) => p.number)).toEqual([1, 2]);
    expect(fetchWorkdayStable).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 7: Run them to verify they fail**

Run: `NODE_ENV=test yarn vitest run src/services/workday.test.ts src/hooks/useWorkdayExtras.test.ts`
Expected: FAIL. `fetchMyMergedPRs` isn't called, `fetchWorkdaySince` still returns `merged`, and the hook's `merged` stays loading.

- [ ] **Step 8: Point the Workday service at the shared list**

In `src/services/workday.ts`:

Imports:

```ts
import type { DoneTicket, GitHubPR, OffSprintTicket, ReviewedPR, SprintTicket } from "../types";
import { getDoneSince, getOffSprintTickets, getSprintTickets } from "../api/jira/workday";
import { getReviewedSince } from "../api/github";
import { SETTINGS_EVENT } from "./config";
import { fetchMyMergedPRs } from "./github";
```

In `WorkdayExtras`, update the two doc comments:

```ts
  /** My PRs merged since the lookback, filtered from `ticketMerged` (no request of its own). */
  merged: Part<GitHubPR[]>;
  reviewed: Part<ReviewedPR[]>;
  /** My PRs merged in the last MY_MERGED_DAYS (services/github), listed under their deck tickets. */
  ticketMerged: Part<GitHubPR[]>;
```

Delete `TICKET_MERGED_DAYS`, its doc comment and `TICKET_MERGED_MAX`. Change `SinceParts`:

```ts
type SinceParts = Pick<WorkdayExtras, "doneTickets" | "reviewed">;
```

Replace `fetchWorkdayStable` and `fetchWorkdaySince`:

```ts
/**
 * Sprint membership, off-sprint tickets and my merged PRs for the deck's open
 * tickets; independent of the lookback. The merged PRs are the shared list
 * My PRs reads too (fetchMyMergedPRs).
 */
export async function fetchWorkdayStable(
  refreshKey: number,
  signal?: AbortSignal,
  now: Date = new Date(),
): Promise<StableParts> {
  const [sprint, offSprint, ticketMerged] = await Promise.all([
    part(async () => (await getSprintTickets(signal)).tickets),
    part(async () => (await getOffSprintTickets(signal)).issues),
    part(() => fetchMyMergedPRs(refreshKey, now)),
  ]);
  return { sprint, offSprint, ticketMerged };
}

/** "Done since" pieces; refetched when the lookback changes. Merged PRs are derived, not fetched. */
export async function fetchWorkdaySince(since: Date, signal?: AbortSignal): Promise<SinceParts> {
  const [doneTickets, reviewed] = await Promise.all([
    part(async () => (await getDoneSince(since, signal)).tickets),
    part(async () => (await getReviewedSince(since)).reviews),
  ]);
  return { doneTickets, reviewed };
}
```

- [ ] **Step 9: Derive `merged` in the hook**

In `src/hooks/useWorkdayExtras.ts`:

```ts
import { useEffect, useMemo, useState } from "react";
import type { GitHubPR } from "../types";
import { mergedSince } from "../services/github";
import {
  EMPTY_EXTRAS,
  cachedWorkdaySince,
  cachedWorkdayStable,
  fetchWorkdaySince,
  fetchWorkdayStable,
  rememberWorkdaySince,
  rememberWorkdayStable,
  type Part,
  type WorkdayExtras,
} from "../services/workday";
```

In the stable effect, change the call to `fetchWorkdayStable(refreshKey, ctrl.signal)`.

In the since effect, reset only the two fetched parts:

```ts
    setExtras((prev) => ({
      ...prev,
      doneTickets: EMPTY_EXTRAS.doneTickets,
      reviewed: EMPTY_EXTRAS.reviewed,
    }));
```

Replace `return extras;` with:

```ts
  // Merged recently / Standup read my merged PRs since the lookback: a filter of
  // the ticket list, so they cost no request and follow a lookback change at once.
  // The ticket list keeps its last value through a refetch, so neither blinks out.
  const merged = useMemo<Part<GitHubPR[]>>(
    () =>
      extras.ticketMerged.data
        ? { data: mergedSince(extras.ticketMerged.data, new Date(sinceMs)), error: null }
        : extras.ticketMerged,
    [extras.ticketMerged, sinceMs],
  );
  return useMemo(() => ({ ...extras, merged }), [extras, merged]);
```

- [ ] **Step 10: Run them to verify they pass**

Run: `NODE_ENV=test yarn vitest run src/services/workday.test.ts src/hooks/useWorkdayExtras.test.ts`
Expected: PASS

- [ ] **Step 11: Write the failing My PRs test**

In `src/views/prs/PRsView.test.tsx`, swap the mock and import to the shared list:

```ts
import { fetchMyMergedPRs } from "../../services/github";
```

```ts
vi.mock("../../services/github", async (orig) => ({
  ...(await orig<typeof import("../../services/github")>()),
  fetchMyMergedPRs: vi.fn(async () => []),
}));
```

Replace `describe("PRsView recently merged")` with:

```ts
describe("PRsView recently merged", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchMyMergedPRs).mockClear();
  });

  it("reads the shared merged list once the sub-tab opens, keeping the last 3 days", async () => {
    const day = 86_400_000;
    vi.mocked(fetchMyMergedPRs).mockResolvedValue([
      makePR({
        number: 1,
        html_url: "https://github.com/o/r/pull/1",
        merged_at: new Date(Date.now() - day).toISOString(),
      }),
      makePR({
        number: 2,
        html_url: "https://github.com/o/r/pull/2",
        merged_at: new Date(Date.now() - 10 * day).toISOString(),
      }),
    ]);
    render(<PRsView openPRs={[]} loading={false} configured={true} />);
    expect(fetchMyMergedPRs).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Recently Merged" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Recently Merged (1)" })).toBeInTheDocument(),
    );
    expect(fetchMyMergedPRs).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 12: Run it to verify it fails**

Run: `NODE_ENV=test yarn vitest run src/views/prs/PRsView.test.tsx -t "recently merged"`
Expected: FAIL: `fetchMyMergedPRs` not called (PRsView still calls `fetchRecentlyMergedPRs`).

- [ ] **Step 13: Switch My PRs to the shared list**

In `src/views/prs/PRsView.tsx`, change the import on line 4:

```ts
import { fetchMyMergedPRs, mergedSince } from "../../services/github";
```

Add a module-level constant near the other top-level constants:

```ts
/** My PRs' Recently Merged window, cut from the shared 60-day merged list. */
const RECENTLY_MERGED_DAYS = 3;
```

Replace the merged-fetch block (the comment starting "Merged PRs are fetched only once…", the `seenRefreshKey` ref and the effect, ~lines 257–281) with:

```ts
  // Merged PRs are fetched only once the Recently Merged sub-tab is opened, so
  // they don't compete with the open-PR load. It's the shared merged list
  // Workday reads too, kept per refreshKey: a Refresh while on Open is honored
  // the next time Merged is opened.
  const showingMerged = subTab === "merged";
  useEffect(() => {
    if (!configured || !showingMerged) return;
    let cancelled = false;
    setMergedPRsLoading(true);
    fetchMyMergedPRs(refreshKey)
      .then((data) => {
        if (cancelled) return;
        const since = new Date(Date.now() - RECENTLY_MERGED_DAYS * 24 * 60 * 60 * 1000);
        setMergedPRs(mergedSince(data, since));
        setMergedPRsLoaded(true);
      })
      .catch((err) => console.error("Failed to fetch recently merged PRs:", err))
      .finally(() => {
        if (!cancelled) setMergedPRsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, refreshKey, showingMerged]);
```

If `useRef` is no longer used anywhere in the file, drop it from the React import (`yarn lint` flags it).

- [ ] **Step 14: Run the affected suites**

Run: `NODE_ENV=test yarn vitest run src/views/prs src/services src/hooks/useWorkdayExtras.test.ts src/views/workday`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add src/services/github.ts src/services/github.test.ts src/services/workday.ts src/services/workday.test.ts src/hooks/useWorkdayExtras.ts src/hooks/useWorkdayExtras.test.ts src/views/prs/PRsView.tsx src/views/prs/PRsView.test.tsx
git commit -m "perf(merged): one merged-PR list for Workday and My PRs

Workday searched my merged PRs twice (60 days for tickets, the lookback for
Merged recently, capped at 20) and My PRs a third time. All three now read
one 60-day list, filtered by date.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Standup-only data on demand

**Files:**
- Modify: `src/hooks/useWorkdayExtras.ts`
- Modify: `src/views/workday/WorkdayView.tsx:282`
- Test: `src/hooks/useWorkdayExtras.test.ts`

**Interfaces:**
- Consumes: Task 2's hook.
- Produces: `export interface WorkdayExtrasOptions { needsDone: boolean }`. New signature: `useWorkdayExtras(configured: boolean, since: Date, refreshKey: number, opts: WorkdayExtrasOptions): WorkdayExtras`.

- [ ] **Step 1: Confirm Focus never renders the done parts**

Run: `grep -rn "doneTickets\|reviewed\.data\|\.done\b" src/views/workday --include='*.tsx' | grep -v test`
Expected: only `WorkdayView.tsx`, in `offSprintKeysOf` (`s.done.items`). That only collects off-sprint keys. Done tickets and reviewed PRs belong to tickets that are resolved or someone else's, so they never carry the off-sprint flag. If anything else shows up, stop and re-check before going on.

- [ ] **Step 2: Write the failing tests**

In `src/hooks/useWorkdayExtras.test.ts`, pass the new options everywhere the hook is called. In `mountLoaded`:

```ts
  const hook = renderHook((key: number) => useWorkdayExtras(true, since, key, { needsDone: true }), {
    initialProps: refreshKey,
  });
```

In the other tests, add `{ needsDone: true }` as the 4th argument: the revisit test, the "refresh elsewhere" test and the Task 2 derive test.

Append:

```ts
  it("leaves the done-since parts unfetched while Focus is showing", async () => {
    const { result } = renderHook(() => useWorkdayExtras(true, since, 0, { needsDone: false }));
    await waitFor(() => expect(result.current.ticketMerged.data).not.toBeNull());
    expect(fetchWorkdaySince).not.toHaveBeenCalled();
    expect(result.current.doneTickets).toEqual({ data: null, error: null });
  });

  it("fetches the done-since parts once List or Standup opens", async () => {
    const { result, rerender } = renderHook(
      (needsDone: boolean) => useWorkdayExtras(true, since, 0, { needsDone }),
      { initialProps: false },
    );
    await waitFor(() => expect(result.current.ticketMerged.data).not.toBeNull());
    rerender(true);
    await waitFor(() => expect(result.current.doneTickets.data).toEqual([]));
    expect(fetchWorkdaySince).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `NODE_ENV=test yarn vitest run src/hooks/useWorkdayExtras.test.ts`
Expected: FAIL: "leaves the done-since parts unfetched" sees `fetchWorkdaySince` called.

- [ ] **Step 4: Gate the since effect**

In `src/hooks/useWorkdayExtras.ts`, add above the hook:

```ts
export interface WorkdayExtrasOptions {
  /** List or Standup is showing: load the done-since parts (Focus doesn't read them). */
  needsDone: boolean;
}
```

Change the signature and the since effect:

```ts
export function useWorkdayExtras(
  configured: boolean,
  since: Date,
  refreshKey: number,
  opts: WorkdayExtrasOptions,
): WorkdayExtras {
  const { needsDone } = opts;
```

```ts
  useEffect(() => {
    if (!configured || !needsDone) return;
    // …existing body unchanged…
  }, [configured, needsDone, sinceMs, refreshKey]);
```

Add to the hook's doc comment: `Done tickets and reviewed PRs load only while List or Standup is showing (needsDone); Focus never reads them.`

- [ ] **Step 5: Pass the mode from Workday**

In `src/views/workday/WorkdayView.tsx`, line 282:

```ts
  // Done tickets and reviewed PRs feed List and Standup only; Focus (and the
  // phone, which is always Focus) doesn't fetch them.
  const extras = useWorkdayExtras(configured, since, refreshKey, { needsDone: mode !== "focus" });
```

- [ ] **Step 6: Run the tests**

Run: `NODE_ENV=test yarn vitest run src/hooks/useWorkdayExtras.test.ts src/views/workday`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useWorkdayExtras.ts src/hooks/useWorkdayExtras.test.ts src/views/workday/WorkdayView.tsx
git commit -m "perf(workday): load done tickets and reviewed PRs only for List and Standup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: One Jira query for assigned tickets

**Files:**
- Modify: `src/types.ts` (`JiraIssue`, after `codeReviewers` ~line 43)
- Modify: `src/api/jira/issues.ts` (constants ~line 10–30, `mapIssue` ~33, `getIssues` ~82)
- Modify: `src/api/jira/workday.ts` (remove `getSprintTickets`, `getOffSprintTickets`, helpers)
- Modify: `src/api/jira/index.ts:5`
- Modify: `src/services/workday.ts`
- Modify: `src/hooks/useWorkdayExtras.ts`
- Modify: `src/views/workday/WorkdayView.tsx` (props interface, destructure, hook call)
- Modify: `src/App.tsx` (~line 749, `<WorkdayView … />`)
- Test: `src/api/jira/index.test.ts`, `src/api/jira/workday.test.ts`, `src/services/workday.test.ts`, `src/hooks/useWorkdayExtras.test.ts`

**Interfaces:**
- Consumes: Task 3's `WorkdayExtrasOptions`.
- Produces:
  - `JiraIssue.openSprint?: string | null`, `JiraIssue.points?: number | null`, `JiraIssue.flagged?: boolean`
  - `mapIssue(issue, opts?: { withDetail?: boolean; withSprint?: boolean })`
  - `export function sprintNameOf(f: any): string | null` and `export function isFlagged(f: any): boolean` in `src/api/jira/issues.ts`
  - `export interface AssignedIssues { issues: JiraIssue[]; loaded: boolean; error: string | null }` and `export function sprintParts(assigned: AssignedIssues | undefined, now: Date): Pick<WorkdayExtras, "sprint" | "offSprint">` in `src/services/workday.ts`
  - `fetchWorkdayStable(refreshKey: number, now?: Date): Promise<{ ticketMerged }>` (no signal, no Jira)
  - `WorkdayExtrasOptions.assigned?: AssignedIssues`
  - `WorkdayViewProps.assignedLoaded?: boolean`

- [ ] **Step 1: Write the failing Jira API tests**

In `src/api/jira/index.test.ts`, extend the existing `./issues` import to `import { mapIssue, resetMyselfCache } from "./issues";`. Append inside `describe("getIssues")`:

```ts
    it("asks for open-sprint tickets however old, with sprint, points and flagged", async () => {
      const adapter = vi.fn(async () => ({ data: { issues: [] } }));
      httpMock.adapter = adapter as any;
      await getIssues();
      const data = JSON.parse((adapter as any).mock.calls[0][0].data);
      expect(data.jql).toBe(
        "assignee = currentUser() AND resolution = Unresolved AND statusCategory != Done AND (updated >= -90d OR sprint in openSprints()) ORDER BY updated DESC",
      );
      expect(data.fields).toEqual(
        expect.arrayContaining(["customfield_10020", "customfield_10127", "customfield_10021"]),
      );
    });

    it("maps each ticket's open sprint, points and flagged", async () => {
      httpMock.adapter = vi.fn(async () => ({
        data: {
          issues: [
            {
              key: "CCP-1",
              fields: {
                summary: "One",
                customfield_10020: [
                  { name: "Sprint 41", state: "closed" },
                  { name: "Sprint 42", state: "active" },
                ],
                customfield_10127: 3,
                customfield_10021: [{ value: "Impediment" }],
              },
            },
            {
              key: "CCP-2",
              fields: { summary: "Two", customfield_10020: [{ name: "Sprint 41", state: "closed" }] },
            },
            { key: "CCP-3", fields: { summary: "Three" } },
          ],
        },
      })) as any;
      const { issues } = await getIssues();
      expect(issues.map((i: any) => [i.key, i.openSprint, i.points, i.flagged])).toEqual([
        ["CCP-1", "Sprint 42", 3, true],
        ["CCP-2", null, null, false],
        ["CCP-3", null, null, false],
      ]);
    });

    it("leaves the sprint fields off lists that didn't ask for them", () => {
      expect(mapIssue({ key: "X-1", fields: {} })).not.toHaveProperty("openSprint");
    });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `NODE_ENV=test yarn vitest run src/api/jira/index.test.ts -t getIssues`
Expected: FAIL: JQL mismatch, and `openSprint` is undefined.

- [ ] **Step 3: Extend the type and the assigned query**

In `src/types.ts`, inside `JiraIssue` after `codeReviewers`:

```ts
  /**
   * Assigned-issues list only (undefined elsewhere): the active sprint's name,
   * else the first open one's; null when the ticket is in no open sprint.
   */
  openSprint?: string | null;
  /** Story points; assigned-issues list only. */
  points?: number | null;
  /** Jira's Flagged field is set; assigned-issues list only. */
  flagged?: boolean;
```

In `src/api/jira/issues.ts`, after `BASE_ISSUE_FIELDS`, add:

```ts
/**
 * The assigned list also carries what Workday splits sprint / off-sprint on
 * (services/workday sprintParts), so neither needs a query of its own.
 */
const ASSIGNED_ISSUE_FIELDS = [...BASE_ISSUE_FIELDS, SPRINT_FIELD, STORY_POINTS_FIELD, FLAGGED_FIELD];

/** Active sprint's name, else the first non-closed one, else null. */
export function sprintNameOf(f: any): string | null {
  const sprints: any[] = Array.isArray(f[SPRINT_FIELD]) ? f[SPRINT_FIELD] : [];
  const active = sprints.find((s) => s?.state === "active");
  const open = active ?? sprints.find((s) => s?.state !== "closed");
  return open?.name ?? null;
}

/** Jira's Flagged field holds e.g. [{ value: "Impediment" }] when set. */
export function isFlagged(f: any): boolean {
  return Array.isArray(f[FLAGGED_FIELD]) && f[FLAGGED_FIELD].length > 0;
}
```

Change `mapIssue`'s signature and add the sprint block before `return mapped;`:

```ts
export function mapIssue(
  issue: any,
  opts: { withDetail?: boolean; withSprint?: boolean } = {},
): any {
```

```ts
  if (opts.withSprint) {
    mapped.openSprint = sprintNameOf(f);
    mapped.points = typeof f[STORY_POINTS_FIELD] === "number" ? f[STORY_POINTS_FIELD] : null;
    mapped.flagged = isFlagged(f);
  }
  return mapped;
```

In `getIssues`, replace the JQL line, the fields and the mapping:

```ts
  // One query for every "assigned to me" list: My Issues, and Workday's sprint
  // and off-sprint split. Open-sprint tickets count however long ago they were touched.
  const jql = `assignee = currentUser() AND resolution = Unresolved AND statusCategory != Done AND (updated >= -90d OR sprint in openSprints()) ORDER BY updated DESC`;
```

```ts
    const payload: Record<string, any> = { jql, fields: ASSIGNED_ISSUE_FIELDS, maxResults: 100 };
```

```ts
  return { issues: raw.map((issue) => mapIssue(issue, { withSprint: true })) };
```

- [ ] **Step 4: Run them to verify they pass**

Run: `NODE_ENV=test yarn vitest run src/api/jira/index.test.ts`
Expected: PASS

- [ ] **Step 5: Remove the two Workday Jira queries**

In `src/api/jira/workday.ts`, delete:
- `getSprintTickets`
- `getOffSprintTickets`
- the local `sprintNameOf` and `isFlagged`
- `MAX_SPRINT` and `MAX_OFF_SPRINT`

Trim the imports to what `getDoneSince` still uses. Expected result:

```ts
import { jiraClient } from "../http";
import type { DoneTicket } from "../../types";
import { formatJqlDate } from "../../views/workday/dates";
import { getMyself } from "./issues";
```

(`getDoneSince` calls `getMyself`, so that import stays.)

In `src/api/jira/index.ts` line 5:

```ts
export { getDoneSince } from "./workday";
```

In `src/api/jira/workday.test.ts`, delete `describe("getSprintTickets")` and `describe("getOffSprintTickets")`, and change the import to `import { getDoneSince } from "./workday";`. Their mapping is now covered by the `getIssues` tests above and the `sprintParts` tests below.

- [ ] **Step 6: Write the failing `sprintParts` and service tests**

In `src/services/workday.test.ts`:

1. The Jira mock becomes:

```ts
vi.mock("../api/jira/workday", () => ({
  getDoneSince: vi.fn(),
}));
```

2. Add `sprintParts` to the `./workday` import and `import type { JiraIssue } from "../types";`.

3. Replace `"isolates failures per part"` and `"reads the deck's merged PRs from the shared list…"` with:

```ts
  it("isolates failures per part", async () => {
    vi.mocked(jira.getDoneSince).mockRejectedValue(new Error("jira boom"));
    vi.mocked(gh.getReviewedSince).mockResolvedValue({ reviews: [] });
    const res = await fetchWorkdaySince(new Date("2026-10-08T00:00:00Z"));
    expect(res.doneTickets).toEqual({ data: null, error: "jira boom" });
    expect(res.reviewed).toEqual({ data: [], error: null });
  });

  it("fetches only the shared merged list for the stable group, under the refreshKey", async () => {
    vi.mocked(fetchMyMergedPRs).mockRejectedValue(new Error("gh down"));
    const now = new Date("2026-10-14T12:00:00Z");
    const stable = await fetchWorkdayStable(3, now);
    expect(fetchMyMergedPRs).toHaveBeenCalledWith(3, now);
    expect(stable).toEqual({ ticketMerged: { data: null, error: "gh down" } });
  });
```

4. In `describe("workday cache")`, change `stable` and the failed-part test:

```ts
  const stable = { ticketMerged: ok([]) };
```

```ts
  it("doesn't keep a group with a failed part, so the next visit retries it", () => {
    rememberWorkdayStable(3, { ticketMerged: { data: null, error: "gh down" } });
    expect(cachedWorkdayStable(3)).toBeNull();
  });
```

5. Append:

```ts
describe("sprintParts", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  const issue = (key: string, over: Partial<JiraIssue> = {}): JiraIssue =>
    ({
      key,
      summary: key,
      status: { name: "To Do", statusCategory: { key: "new", colorName: "blue-gray" } },
      project: { key: "CCP", name: "CCP" },
      created: "2026-10-01T00:00:00Z",
      updated: "2026-11-01T00:00:00Z",
      codeReviewers: [],
      openSprint: null,
      points: null,
      flagged: false,
      ...over,
    }) as JiraIssue;

  it("reads as loading until the assigned list has fetched this session", () => {
    const parts = sprintParts(
      { issues: [issue("CCP-1", { openSprint: "Sprint 42" })], loaded: false, error: null },
      now,
    );
    expect(parts).toEqual({
      sprint: { data: null, error: null },
      offSprint: { data: null, error: null },
    });
  });

  it("carries the source's error while it hasn't loaded", () => {
    const parts = sprintParts({ issues: [], loaded: false, error: "jira down" }, now);
    expect(parts.sprint).toEqual({ data: null, error: "jira down" });
    expect(parts.offSprint).toEqual({ data: null, error: "jira down" });
  });

  it("splits tickets in an open sprint from the rest", () => {
    const inSprint = issue("CCP-1", {
      openSprint: "Sprint 42",
      points: 3,
      flagged: true,
      status: { name: "In Progress", statusCategory: { key: "indeterminate", colorName: "yellow" } },
    });
    const { sprint, offSprint } = sprintParts(
      { issues: [inSprint, issue("CCP-2")], loaded: true, error: null },
      now,
    );
    expect(sprint.data).toEqual([
      {
        key: "CCP-1",
        summary: "CCP-1",
        status: { name: "In Progress", categoryKey: "indeterminate" },
        sprintName: "Sprint 42",
        points: 3,
        flagged: true,
      },
    ]);
    expect(offSprint.data?.map((t) => [t.key, t.flagged])).toEqual([["CCP-2", false]]);
  });

  it("leaves out off-sprint tickets untouched for 60 days", () => {
    const { offSprint } = sprintParts(
      { issues: [issue("CCP-3", { updated: "2026-09-01T00:00:00Z" })], loaded: true, error: null },
      now,
    );
    expect(offSprint.data).toEqual([]);
  });

  it("reads as loading with no assigned source at all", () => {
    expect(sprintParts(undefined, now).sprint).toEqual({ data: null, error: null });
  });
});
```

- [ ] **Step 7: Write the failing hook test**

In `src/hooks/useWorkdayExtras.test.ts`:

1. Add `JiraIssue` to the type import: `import type { GitHubPR, JiraIssue } from "../types";`.

2. The `beforeEach` stable mock becomes `{ ticketMerged: ok([]) }`. Also update the Task 2 derive test's mock to `{ ticketMerged: ok([...]) }` (drop `sprint`/`offSprint`).

3. Add a module-level loaded-but-empty source and pass it in `mountLoaded` and the revisit test, so `sprint` reads `[]` as before:

```ts
const noneAssigned = { issues: [] as JiraIssue[], loaded: true, error: null };
```

```ts
  const hook = renderHook(
    (key: number) => useWorkdayExtras(true, since, key, { needsDone: true, assigned: noneAssigned }),
    { initialProps: refreshKey },
  );
```

In the revisit test: `useWorkdayExtras(true, since, 0, { needsDone: true, assigned: noneAssigned })`.

4. Append:

```ts
  it("splits sprint and off-sprint from the assigned list instead of fetching them", () => {
    const assigned = {
      issues: [
        {
          key: "CCP-1",
          summary: "One",
          status: { name: "To Do", statusCategory: { key: "new", colorName: "" } },
          updated: new Date().toISOString(),
          openSprint: "Sprint 42",
        } as JiraIssue,
      ],
      loaded: true,
      error: null,
    };
    const { result } = renderHook(() =>
      useWorkdayExtras(true, since, 0, { needsDone: false, assigned }),
    );
    expect(result.current.sprint.data?.map((t) => t.key)).toEqual(["CCP-1"]);
    expect(result.current.offSprint.data).toEqual([]);
  });
```

- [ ] **Step 8: Run them to verify they fail**

Run: `NODE_ENV=test yarn vitest run src/services/workday.test.ts src/hooks/useWorkdayExtras.test.ts`
Expected: FAIL: `sprintParts is not a function`, and `fetchWorkdayStable` still returns sprint/off-sprint.

- [ ] **Step 9: Add `sprintParts` and shrink the stable group**

In `src/services/workday.ts`:

Imports:

```ts
import type {
  DoneTicket,
  GitHubPR,
  JiraIssue,
  OffSprintTicket,
  ReviewedPR,
  SprintTicket,
} from "../types";
import { getDoneSince } from "../api/jira/workday";
import { getReviewedSince } from "../api/github";
import { SETTINGS_EVENT } from "./config";
import { fetchMyMergedPRs } from "./github";
```

Change `StableParts`:

```ts
type StableParts = Pick<WorkdayExtras, "ticketMerged">;
```

Replace `fetchWorkdayStable`:

```ts
/**
 * My merged PRs for the deck's open tickets: the shared list My PRs reads too
 * (fetchMyMergedPRs). Not aborted with the view, since another view may share
 * the request. Sprint and off-sprint come from sprintParts, not a fetch.
 */
export async function fetchWorkdayStable(
  refreshKey: number,
  now: Date = new Date(),
): Promise<StableParts> {
  return { ticketMerged: await part(() => fetchMyMergedPRs(refreshKey, now)) };
}
```

Append:

```ts
/** Off-sprint tickets are the ones touched in this window. */
const OFF_SPRINT_DAYS = 60;

/** The assigned-issues source, which sprint and off-sprint are split from. */
export interface AssignedIssues {
  issues: JiraIssue[];
  /**
   * The source has fetched this session. A list cached from before the sprint
   * fields were requested would otherwise split every ticket off-sprint.
   */
  loaded: boolean;
  error: string | null;
}

/**
 * Workday's sprint and off-sprint parts, split from the assigned-issues list
 * (each ticket carries its open sprint) rather than two queries of their own.
 */
export function sprintParts(
  assigned: AssignedIssues | undefined,
  now: Date,
): Pick<WorkdayExtras, "sprint" | "offSprint"> {
  if (!assigned?.loaded) {
    const pending = { data: null, error: assigned?.error ?? null };
    return { sprint: pending, offSprint: pending };
  }
  const cutoff = now.getTime() - OFF_SPRINT_DAYS * 24 * 60 * 60 * 1000;
  const sprint: SprintTicket[] = [];
  const offSprint: OffSprintTicket[] = [];
  for (const i of assigned.issues) {
    if (i.openSprint) {
      sprint.push({
        key: i.key,
        summary: i.summary,
        status: { name: i.status.name, categoryKey: i.status.statusCategory.key ?? "new" },
        sprintName: i.openSprint,
        points: i.points ?? null,
        flagged: i.flagged ?? false,
      });
    } else if (new Date(i.updated).getTime() >= cutoff) {
      offSprint.push({ ...i, flagged: i.flagged ?? false });
    }
  }
  return { sprint: { data: sprint, error: null }, offSprint: { data: offSprint, error: null } };
}
```

- [ ] **Step 10: Derive sprint/off-sprint in the hook**

In `src/hooks/useWorkdayExtras.ts`:

Add `sprintParts` and `type AssignedIssues` to the `../services/workday` import. Extend the options:

```ts
export interface WorkdayExtrasOptions {
  /** List or Standup is showing: load the done-since parts (Focus doesn't read them). */
  needsDone: boolean;
  /** The assigned-issues source; sprint and off-sprint are split from it, not fetched. */
  assigned?: AssignedIssues;
}
```

Destructure `const { needsDone, assigned } = opts;`. In the stable effect, delete the `setExtras` that resets `sprint`/`offSprint` (and its comment line about them). Call `fetchWorkdayStable(refreshKey)` with no signal. Keep the `AbortController` only to ignore a result after unmount:

```ts
    const ctrl = new AbortController();
    fetchWorkdayStable(refreshKey).then((res) => {
      if (ctrl.signal.aborted) return;
      rememberWorkdayStable(refreshKey, res);
      setExtras((prev) => ({ ...prev, ...res }));
    });
    return () => ctrl.abort();
```

Replace the final `return useMemo(() => ({ ...extras, merged }), [extras, merged]);` with:

```ts
  const sprint = useMemo(() => sprintParts(assigned, new Date()), [assigned]);
  return useMemo(() => ({ ...extras, merged, ...sprint }), [extras, merged, sprint]);
```

- [ ] **Step 11: Wire Workday and App**

In `src/views/workday/WorkdayView.tsx`, add to `WorkdayViewProps` after `sourceError`:

```ts
  /**
   * The assigned-issues source has fetched this session; the sprint /
   * off-sprint split waits for it. Defaults to true.
   */
  assignedLoaded?: boolean;
```

Add `assignedLoaded = true,` to the props destructure, next to `sourcesLoaded = true,`. Replace the hook call from Task 3 with:

```ts
  // Sprint and off-sprint are split from the assigned list (no Jira call of
  // their own). Done tickets and reviewed PRs feed List and Standup only.
  const assigned = useMemo(
    () => ({ issues: assignedIssues, loaded: assignedLoaded, error: sourceError }),
    [assignedIssues, assignedLoaded, sourceError],
  );
  const extras = useWorkdayExtras(configured, since, refreshKey, {
    needsDone: mode !== "focus",
    assigned,
  });
```

(`assignedIssues` is already destructured from props; if it's read off `props.` instead, use `props.assignedIssues`.)

In `src/App.tsx`, in `<WorkdayView …>` right after the `sourcesLoaded={…}` prop:

```tsx
                        assignedLoaded={loadedSources.has("jiraIssues")}
```

- [ ] **Step 12: Run the tests and typecheck**

Run: `NODE_ENV=test yarn vitest run src/api/jira src/services src/hooks src/views/workday && yarn typecheck`
Expected: PASS, no type errors.

- [ ] **Step 13: Commit**

```bash
git add src/types.ts src/api/jira src/services/workday.ts src/services/workday.test.ts src/hooks/useWorkdayExtras.ts src/hooks/useWorkdayExtras.test.ts src/views/workday/WorkdayView.tsx src/App.tsx
git commit -m "perf(jira): one assigned-tickets query feeds My Issues and Workday's sprint split

Sprint and off-sprint tickets were two more \"assigned to me\" queries. The
assigned list now carries each ticket's open sprint, points and flagged, and
Workday splits it, so it also refreshes with the regular poll.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Save the GitHub mention caches

**Files:**
- Modify: `src/api/github/notifications.ts`
- Modify: `src/api/github/index.ts` (`getGithubMentions`, ~line 270)
- Test: `src/api/github/costs.test.ts`

**Interfaces:**
- Produces (`src/api/github/notifications.ts`):
  - `export const MENTIONS_CACHE_KEY = "dev-home-mentions-cache"`
  - `export function trimNotification(n: any): any`
  - `export function hydrateMentionsCache(): void`
  - `export function saveMentionsCache(): void`
  - `export function forgetMentionsMemory(): void` (test helper)

- [ ] **Step 1: Write the failing tests**

In `src/api/github/costs.test.ts`, add an import:

```ts
import { MENTIONS_CACHE_KEY, forgetMentionsMemory } from "./notifications";
```

Append after `describe("getGithubMentions caching")`:

```ts
describe("getGithubMentions saved cache", () => {
  it("answers a reload from the saved cache: a conditional request and no per-thread calls", async () => {
    inbox = [notification(1), notification(2)];
    const first = await getGithubMentions();

    forgetMentionsMemory(); // a page reload
    adapter.mockClear();
    notModified = true;
    const second = await getGithubMentions();
    expect(headerOf(notificationCalls()[0], "If-Modified-Since")).toBe(LAST_MODIFIED);
    expect(commentCalls()).toHaveLength(0);
    expect(subjectCalls()).toHaveLength(0);
    expect(second).toEqual(first);
  });

  it("after a reload, fetches comments only for threads that changed", async () => {
    inbox = [notification(1, "2026-09-01T00:00:00Z"), notification(2, "2026-09-02T00:00:00Z")];
    await getGithubMentions();

    forgetMentionsMemory();
    adapter.mockClear();
    inbox = [notification(1, "2026-09-01T00:00:00Z"), notification(2, "2026-09-10T00:00:00Z")];
    await getGithubMentions();
    expect(commentCalls()).toEqual([`${API}/repos/test-org/app/issues/comments/2`]);
  });

  it("ignores a cache saved for another GitHub user", async () => {
    inbox = [notification(1)];
    await getGithubMentions();
    const saved = JSON.parse(localStorage.getItem(MENTIONS_CACHE_KEY)!);
    localStorage.setItem(MENTIONS_CACHE_KEY, JSON.stringify({ ...saved, owner: "someone-else" }));

    forgetMentionsMemory();
    adapter.mockClear();
    notModified = true;
    await getGithubMentions();
    expect(headerOf(notificationCalls()[0], "If-Modified-Since")).toBeUndefined();
    expect(commentCalls()).toHaveLength(1);
  });

  it("starts cold when the saved cache is garbled", async () => {
    localStorage.setItem(MENTIONS_CACHE_KEY, "{not json");
    forgetMentionsMemory();
    inbox = [notification(1)];
    const { mentions } = await getGithubMentions();
    expect(mentions).toHaveLength(1);
  });

  it("saves only the notification fields it uses", async () => {
    const n: any = {
      ...notification(1),
      unread: true,
      url: "https://api.github.com/notifications/threads/1",
      subscription_url: "https://api.github.com/notifications/threads/1/subscription",
      repository: { full_name: "test-org/app", owner: { login: "test-org" }, private: true },
    };
    inbox = [n];
    await getGithubMentions();
    const saved = JSON.parse(localStorage.getItem(MENTIONS_CACHE_KEY)!);
    expect(saved.owner).toBe("testuser");
    expect(saved.notifications.list).toEqual([
      {
        id: "1",
        reason: "mention",
        updated_at: n.updated_at,
        repository: { full_name: "test-org/app" },
        subject: {
          type: null,
          title: "PR 1",
          url: `${API}/repos/test-org/app/pulls/1`,
          latest_comment_url: `${API}/repos/test-org/app/issues/comments/1`,
        },
      },
    ]);
  });

  it("removes the saved cache when settings change", async () => {
    inbox = [notification(1)];
    await getGithubMentions();
    expect(localStorage.getItem(MENTIONS_CACHE_KEY)).not.toBeNull();
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    expect(localStorage.getItem(MENTIONS_CACHE_KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `NODE_ENV=test yarn vitest run src/api/github/costs.test.ts -t "saved cache"`
Expected: FAIL: `forgetMentionsMemory is not a function`.

- [ ] **Step 3: Implement the saved cache**

In `src/api/github/notifications.ts`, change the config import:

```ts
import { SETTINGS_EVENT, loadSettings } from "../../services/config";
```

Add after the `SUBJECT_OPEN_TTL_MS` declaration:

```ts
/**
 * The three caches above, saved so a page load starts warm: the first
 * notifications request is conditional (a free 304 when nothing changed) and
 * threads whose `updated_at` hasn't moved need no calls. Scoped to the GitHub
 * user; read once per page load, written once per mentions refresh.
 */
export const MENTIONS_CACHE_KEY = "dev-home-mentions-cache";

/** The saved copy has been read into memory (or deliberately skipped). */
let hydrated = false;

const cacheOwner = () => loadSettings().githubUsername || "";

/** A notification cut to the fields the mentions code reads, so the saved copy stays small. */
export function trimNotification(n: any): any {
  return {
    id: String(n.id),
    reason: n.reason,
    updated_at: n.updated_at,
    repository: { full_name: n.repository?.full_name ?? "" },
    subject: {
      type: n.subject?.type ?? null,
      title: n.subject?.title ?? "",
      url: n.subject?.url ?? null,
      latest_comment_url: n.subject?.latest_comment_url ?? null,
    },
  };
}

/** Fill the in-memory caches from the saved copy, once per page load. */
export function hydrateMentionsCache(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const saved = JSON.parse(localStorage.getItem(MENTIONS_CACHE_KEY) || "null");
    if (!saved || saved.owner !== cacheOwner()) return;
    const n = saved.notifications;
    if (n && Array.isArray(n.list)) {
      notificationsCache = {
        since: n.since ?? null,
        lastModified: n.lastModified ?? null,
        notifications: n.list,
      };
    }
    for (const [k, v] of Object.entries(saved.subjects ?? {})) subjectStates.set(k, v as any);
    for (const [k, v] of Object.entries(saved.comments ?? {})) threadComments.set(k, v as any);
  } catch {
    // Garbled copy: start cold.
  }
}

/** Write the in-memory caches back; quota errors leave memory as the only copy. */
export function saveMentionsCache(): void {
  try {
    localStorage.setItem(
      MENTIONS_CACHE_KEY,
      JSON.stringify({
        owner: cacheOwner(),
        notifications: {
          since: notificationsCache.since,
          lastModified: notificationsCache.lastModified,
          list: notificationsCache.notifications,
        },
        subjects: Object.fromEntries(subjectStates),
        comments: Object.fromEntries(threadComments),
      }),
    );
  } catch {
    /* quota exceeded */
  }
}

/** Test helper: drop the in-memory caches but keep the saved copy, as a page reload does. */
export function forgetMentionsMemory(): void {
  notificationsCache = { since: null, lastModified: null, notifications: [] };
  threadComments.clear();
  subjectStates.clear();
  hydrated = false;
}
```

Update `resetMentionsCache` so a settings change also drops the saved copy:

```ts
export function resetMentionsCache(): void {
  notificationsCache = { since: null, lastModified: null, notifications: [] };
  threadComments.clear();
  subjectStates.clear();
  // Nothing saved to read back: the copy below is gone.
  hydrated = true;
  try {
    localStorage.removeItem(MENTIONS_CACHE_KEY);
  } catch {
    /* storage unavailable */
  }
}
```

In `fetchAllNotifications`, keep the trimmed shape in memory as well, so memory and the saved copy match:

```ts
    for (const n of data) {
      if (ALLOWED_REASONS.has(n.reason)) all.push(trimNotification(n));
    }
```

- [ ] **Step 4: Hydrate and save around a mentions refresh**

In `src/api/github/index.ts`, add `hydrateMentionsCache` and `saveMentionsCache` to the `./notifications` import. In `getGithubMentions`:

```ts
  hydrateMentionsCache();
  const allNotifications = await fetchAllNotifications(github, since, signal);
```

Replace the `const mentions = [...]` block with:

```ts
  const threadMentions = await fetchCommentsInBatches(notifications, github);
  // Saved before the own-PR search settles, so its failure can't lose the threads' work.
  saveMentionsCache();
  const mentions = [...threadMentions, ...(await ownPrComments)];
```

- [ ] **Step 5: Run the mention tests**

Run: `NODE_ENV=test yarn vitest run src/api/github/costs.test.ts`
Expected: PASS (new and existing tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/github/notifications.ts src/api/github/index.ts src/api/github/costs.test.ts
git commit -m "perf(mentions): save the mention caches so a page load starts warm

Every load re-checked up to 50 threads' subjects and re-fetched up to 50
latest comments. The caches now survive a reload, scoped to the GitHub user.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: One GraphQL query for mention open-state checks

**Files:**
- Modify: `src/api/http/github.ts:21-40`
- Modify: `src/api/github/queries.ts` (append)
- Modify: `src/api/github/notifications.ts` (`filterOpenNotifications` ~line 147, `fetchNotificationComment` ~line 192)
- Modify: `src/api/github/index.ts` (`filterOpenNotifications` call)
- Test: `src/api/http/clients.test.ts`, `src/api/github/queries.test.ts`, `src/api/github/costs.test.ts`

**Interfaces:**
- Consumes: Task 5's caches and `trimNotification`.
- Produces:
  - `githubGraphql(query, variables?, opts?: { signal?: AbortSignal; allowPartial?: boolean })`
  - `export function buildSubjectStatesQuery(count: number): string` (`queries.ts`)
  - `export function subjectRef(url: string | null | undefined): { owner: string; repo: string; number: number } | null` (`notifications.ts`)
  - `filterOpenNotifications(notifications: any[], signal?: AbortSignal): Promise<any[]>` (no `HttpClient` argument)

- [ ] **Step 1: Write the failing client and query tests**

In `src/api/http/clients.test.ts`, after `"githubGraphql throws on GraphQL errors"`:

```ts
  it("githubGraphql returns partial data with allowPartial", async () => {
    httpMock.adapter = vi.fn(async (config) => ({
      data: { data: { s0: { ok: 1 }, s1: null }, errors: [{ message: "Could not resolve" }] },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    }));
    await expect(githubGraphql("query{x}", {}, { allowPartial: true })).resolves.toEqual({
      s0: { ok: 1 },
      s1: null,
    });
  });

  it("githubGraphql still throws with allowPartial when there's no data", async () => {
    httpMock.adapter = vi.fn(async (config) => ({
      data: { data: null, errors: [{ message: "x" }] },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    }));
    await expect(githubGraphql("query{x}", {}, { allowPartial: true })).rejects.toThrow(
      "GitHub GraphQL error: x",
    );
  });
```

In `src/api/github/queries.test.ts`, add `buildSubjectStatesQuery` to the import and append:

```ts
describe("buildSubjectStatesQuery", () => {
  it("aliases one lookup per subject, with variables, and the two state enums apart", () => {
    const q = buildSubjectStatesQuery(2);
    expect(q).toContain(
      "query SubjectStates($o0: String!, $r0: String!, $n0: Int!, $o1: String!, $r1: String!, $n1: Int!)",
    );
    expect(q).toContain("s0: repository(owner: $o0, name: $r0)");
    expect(q).toContain("s1: repository(owner: $o1, name: $r1)");
    expect(q).toContain("issueOrPullRequest(number: $n1)");
    // PullRequestState and IssueState are different enums: GraphQL rejects
    // both under one response name, so each gets its own alias.
    expect(q).toContain("prState: state");
    expect(q).toContain("issueState: state");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `NODE_ENV=test yarn vitest run src/api/http/clients.test.ts src/api/github/queries.test.ts`
Expected: FAIL. The `allowPartial` test rejects, and `buildSubjectStatesQuery` is not a function.

- [ ] **Step 3: Add `allowPartial` and the query builder**

In `src/api/http/github.ts`, change `githubGraphql`:

```ts
export async function githubGraphql<T = any>(
  query: string,
  variables: Record<string, any> = {},
  opts: { signal?: AbortSignal; allowPartial?: boolean } = {},
): Promise<T> {
  const { githubToken } = requireSettings();
  const { data: body } = await request<GraphQLResponse<T>>("post", `${GITHUB_API}/graphql`, {
    data: { query, variables },
    headers: { Authorization: `Bearer ${githubToken}` },
    signal: opts.signal,
  });

  // allowPartial: batched lookups where one bad item (a deleted repo) mustn't
  // sink the rest; its alias comes back null alongside the error.
  const partialOk = opts.allowPartial && body.data != null;
  if (body.errors && body.errors.length > 0 && !partialOk) {
    const messages = body.errors.map((e) => e.message).join("; ");
    const error: any = new Error(`GitHub GraphQL error: ${messages}`);
    error.graphqlErrors = body.errors;
    throw error;
  }
  return body.data;
}
```

In `src/api/github/queries.ts`, append:

```ts
/** What a mention needs from its issue/PR when that's the thread's latest event. */
const SUBJECT_FIELDS = `databaseId url body createdAt updatedAt author { login avatarUrl }`;

/**
 * Open/closed state of many issues/PRs in one request: alias `s<i>` looks up
 * `$o<i>/$r<i>#$n<i>`. The two `state` fields are aliased apart because
 * PullRequestState and IssueState are different enums.
 */
export function buildSubjectStatesQuery(count: number): string {
  const vars: string[] = [];
  const lookups: string[] = [];
  for (let i = 0; i < count; i++) {
    vars.push(`$o${i}: String!, $r${i}: String!, $n${i}: Int!`);
    lookups.push(
      `s${i}: repository(owner: $o${i}, name: $r${i}) {
        issueOrPullRequest(number: $n${i}) {
          __typename
          ... on PullRequest { prState: state ${SUBJECT_FIELDS} }
          ... on Issue { issueState: state ${SUBJECT_FIELDS} }
        }
      }`,
    );
  }
  return `query SubjectStates(${vars.join(", ")}) {\n${lookups.join("\n")}\n}`;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `NODE_ENV=test yarn vitest run src/api/http/clients.test.ts src/api/github/queries.test.ts`
Expected: PASS

- [ ] **Step 5: Teach the mention tests' fake GitHub the batched query**

In `src/api/github/costs.test.ts`, add next to the other `let` state:

```ts
/** Subject numbers whose PR reads as merged (closed). */
let closedSubjects: Set<number>;
/** Subject numbers GitHub can't resolve (deleted repo, no access): null alias plus an error. */
let missingSubjects: Set<number>;

/** The SubjectStates response for a request's variables. */
function subjectStatesBody(variables: Record<string, any>) {
  const data: Record<string, any> = {};
  const errors: any[] = [];
  for (let i = 0; `n${i}` in variables; i++) {
    const n = variables[`n${i}`];
    if (missingSubjects.has(n)) {
      data[`s${i}`] = null;
      errors.push({ type: "NOT_FOUND", path: [`s${i}`], message: "Could not resolve" });
      continue;
    }
    data[`s${i}`] = {
      issueOrPullRequest: {
        __typename: "PullRequest",
        prState: closedSubjects.has(n) ? "MERGED" : "OPEN",
        databaseId: n * 1000,
        url: `https://github.com/${variables[`o${i}`]}/${variables[`r${i}`]}/pull/${n}`,
        body: `PR body ${n}`,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
        author: { login: "carol", avatarUrl: "" },
      },
    };
  }
  return errors.length > 0 ? { data, errors } : { data };
}

const isSubjectStates = (config: any) =>
  urlOf(config).endsWith("/graphql") &&
  String(JSON.parse(config.data).query).includes("SubjectStates");

/** Variables of each batched SubjectStates request. */
function subjectBatches(): Record<string, any>[] {
  return adapter.mock.calls
    .map(([c]) => c)
    .filter(isSubjectStates)
    .map((c: any) => JSON.parse(c.data).variables);
}

/** `owner/repo#n` for every subject asked about, across batches. */
function subjectsChecked(): string[] {
  return subjectBatches().flatMap((v) => {
    const out: string[] = [];
    for (let i = 0; `n${i}` in v; i++) out.push(`${v[`o${i}`]}/${v[`r${i}`]}#${v[`n${i}`]}`);
    return out;
  });
}
```

In `beforeEach`, reset them (`closedSubjects = new Set(); missingSubjects = new Set();`). Change the adapter's GraphQL branch:

```ts
    if (url.endsWith("/graphql")) {
      if (isSubjectStates(config)) {
        return response(config, subjectStatesBody(JSON.parse(config.data).variables));
      }
      // Own-PR comments search.
      return response(config, { data: { search: { nodes: ownPrs } } });
    }
```

Keep `subjectCalls()` (REST `/pulls/N` GETs). The tests below use it to assert that none happen.

- [ ] **Step 6: Rewrite the subject tests for the batch, and add the new ones**

In `describe("getGithubMentions caching")`, replace these tests (same names unless noted):

```ts
  it("builds the mention from the batched subject when the latest event is the PR itself", async () => {
    const n = notification(1);
    n.subject.latest_comment_url = n.subject.url;
    inbox = [n];
    const { mentions } = await getGithubMentions();
    expect(subjectCalls()).toHaveLength(0);
    expect(subjectBatches()).toHaveLength(1);
    expect(mentions).toMatchObject([
      {
        id: 1000,
        html_url: "https://github.com/test-org/app/pull/1",
        body: "PR body 1",
        user: { login: "carol" },
      },
    ]);
  });

  it("makes no subject requests on a refresh with unchanged notifications", async () => {
    inbox = [notification(1), notification(2)];
    await getGithubMentions();
    expect(subjectsChecked()).toHaveLength(2);

    adapter.mockClear();
    const { mentions } = await getGithubMentions();
    expect(subjectBatches()).toHaveLength(0);
    expect(mentions).toHaveLength(2);
  });

  it("re-checks the subject when a thread's updated_at changes, and drops it once closed", async () => {
    inbox = [notification(1, "2026-09-01T00:00:00Z")];
    await getGithubMentions();

    adapter.mockClear();
    inbox = [notification(1, "2026-09-10T00:00:00Z")];
    closedSubjects.add(1);
    const { mentions } = await getGithubMentions();
    expect(subjectsChecked()).toEqual(["test-org/app#1"]);
    expect(mentions).toEqual([]);
  });

  it("looks up at most 50 subjects, in one request, when there are more than 50 notifications", async () => {
    inbox = Array.from({ length: 60 }, (_, i) =>
      notification(i + 1, new Date(Date.UTC(2026, 8, 1, 0, i + 1)).toISOString()),
    );
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(1);
    expect(subjectsChecked()).toHaveLength(50);
    expect(subjectsChecked()).not.toContain("test-org/app#10");
  });

  it("evicts cached state for a thread that left the inbox", async () => {
    inbox = [notification(1), notification(2)];
    await getGithubMentions();

    inbox = [notification(1)];
    await getGithubMentions();

    // Thread 2 returns with the same updated_at, but its cache entries are gone.
    adapter.mockClear();
    inbox = [notification(1), notification(2)];
    await getGithubMentions();
    expect(subjectsChecked()).toEqual(["test-org/app#2"]);
    expect(commentCalls()).toEqual([`${API}/repos/test-org/app/issues/comments/2`]);
  });

  it("rechecks cached open subjects after 30 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    inbox = [notification(1)];
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(1);

    adapter.mockClear();
    vi.setSystemTime(new Date("2026-10-01T12:29:00Z"));
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(0);

    vi.setSystemTime(new Date("2026-10-01T12:31:00Z"));
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(1);
  });

  it("keeps cached closed subjects until updated_at changes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    closedSubjects.add(1);
    inbox = [notification(1)];
    await expect(getGithubMentions()).resolves.toEqual({ mentions: [] });
    expect(subjectBatches()).toHaveLength(1);

    adapter.mockClear();
    vi.setSystemTime(new Date("2026-10-01T14:00:00Z"));
    await expect(getGithubMentions()).resolves.toEqual({ mentions: [] });
    expect(subjectBatches()).toHaveLength(0);
  });
```

In `"treats a 304 with nothing cached as an empty list, then does a full fetch"`, change `expect(subjectCalls()).toHaveLength(0);` to `expect(subjectBatches()).toHaveLength(0);`.

Append to the same describe:

```ts
  it("asks about every subject in one GraphQL request, with no REST subject calls", async () => {
    inbox = [notification(1), notification(2), notification(3)];
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(1);
    expect([...subjectsChecked()].sort()).toEqual([
      "test-org/app#1",
      "test-org/app#2",
      "test-org/app#3",
    ]);
    expect(subjectCalls()).toHaveLength(0);
  });

  it("keeps a thread GitHub can't resolve, and asks about it again next time", async () => {
    missingSubjects.add(2);
    inbox = [notification(1), notification(2)];
    const { mentions } = await getGithubMentions();
    expect(mentions.map((m) => m.id).sort()).toEqual([1, 2]);

    adapter.mockClear();
    await getGithubMentions();
    expect(subjectsChecked()).toEqual(["test-org/app#2"]);
  });

  it("keeps every thread, uncached, when the batch fails", async () => {
    const base = adapter.getMockImplementation() as (config: any) => Promise<any>;
    adapter.mockImplementation(async (config: any) => {
      if (isSubjectStates(config)) throw { response: { status: 502, data: {} } };
      return base(config);
    });
    inbox = [notification(1)];
    expect((await getGithubMentions()).mentions).toHaveLength(1);

    adapter.mockImplementation(base);
    adapter.mockClear();
    await getGithubMentions();
    expect(subjectsChecked()).toEqual(["test-org/app#1"]);
  });

  it("leaves subjects without an issue or PR number unchecked", async () => {
    const n: any = notification(1);
    n.subject.url = `${API}/repos/test-org/app/releases/77`;
    n.subject.latest_comment_url = null;
    inbox = [n];
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(0);
    expect(subjectCalls()).toHaveLength(0);
  });
```

- [ ] **Step 7: Run them to verify they fail**

Run: `NODE_ENV=test yarn vitest run src/api/github/costs.test.ts`
Expected: FAIL: `subjectBatches()` is empty, because subjects are still looked up over REST.

- [ ] **Step 8: Batch the open-state check**

In `src/api/github/notifications.ts`, add imports:

```ts
import { githubGraphql } from "../http/github";
import { buildSubjectStatesQuery } from "./queries";
```

Replace `filterOpenNotifications` with:

```ts
/** Owner, repo and number of an issue/PR subject URL; null for other subjects (releases, commits…). */
export function subjectRef(
  url: string | null | undefined,
): { owner: string; repo: string; number: number } | null {
  const m = url?.match(/\/repos\/([^/]+)\/([^/]+)\/(?:pulls|issues)\/(\d+)$/);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

/**
 * Filter out notifications whose subject (PR/issue) is no longer open. Threads
 * whose `updated_at` matches a cached state reuse it (cached "open" states are
 * rechecked after SUBJECT_OPEN_TTL_MS); the rest are asked about in one
 * batched GraphQL request. Freshly fetched subjects ride along as `_subject`,
 * so the comment step needn't fetch a PR/issue that is its own latest event.
 * Anything unknown (a null alias, a failed request) is kept and not cached, so
 * it's retried next time. Subjects without an issue/PR number are kept unchecked.
 */
export async function filterOpenNotifications(
  notifications: any[],
  signal?: AbortSignal,
): Promise<any[]> {
  const now = Date.now();
  const toCheck: { n: any; ref: NonNullable<ReturnType<typeof subjectRef>> }[] = [];
  for (const n of notifications) {
    const ref = subjectRef(n.subject?.url);
    if (!ref) continue;
    const cached = subjectStates.get(String(n.id));
    const fresh =
      cached &&
      cached.updatedAt === n.updated_at &&
      (!cached.open || now - cached.checkedAt < SUBJECT_OPEN_TTL_MS);
    if (!fresh) toCheck.push({ n, ref });
  }

  const subjects = new Map<string, any>();
  if (toCheck.length > 0) {
    const variables: Record<string, string | number> = {};
    toCheck.forEach(({ ref }, i) => {
      variables[`o${i}`] = ref.owner;
      variables[`r${i}`] = ref.repo;
      variables[`n${i}`] = ref.number;
    });
    try {
      const data = await githubGraphql<Record<string, any>>(
        buildSubjectStatesQuery(toCheck.length),
        variables,
        { signal, allowPartial: true },
      );
      toCheck.forEach(({ n }, i) => {
        const subject = data?.[`s${i}`]?.issueOrPullRequest;
        if (!subject) return;
        const state = subject.prState ?? subject.issueState;
        subjectStates.set(String(n.id), {
          updatedAt: n.updated_at,
          open: state === "OPEN",
          checkedAt: now,
        });
        subjects.set(String(n.id), subject);
      });
    } catch {
      // The whole request failed: keep every thread, cache none.
    }
  }

  return notifications.flatMap((n) => {
    const id = String(n.id);
    const state = subjectStates.get(id);
    // Only a state recorded for this exact update can drop a thread.
    if (state && state.updatedAt === n.updated_at && !state.open) return [];
    const subject = subjects.get(id);
    return [subject ? { ...n, _subject: subject } : n];
  });
}
```

In `fetchNotificationComment`, replace the `const comment = …` expression with one that reads the GraphQL subject:

```ts
    // When the latest event is the PR/issue itself, its URL is the subject URL,
    // which the batched open-state check may already have fetched.
    const s = commentUrl === notification.subject?.url ? notification._subject : null;
    const comment = s
      ? {
          id: s.databaseId,
          html_url: s.url,
          body: s.body,
          created_at: s.createdAt,
          updated_at: s.updatedAt,
          user: { login: s.author?.login, avatar_url: s.author?.avatarUrl },
        }
      : (await github.get(commentUrl)).data;
```

In `src/api/github/index.ts`, change the call in `getGithubMentions`:

```ts
  const notifications = await filterOpenNotifications(newest, signal);
```

- [ ] **Step 9: Run the GitHub suites**

Run: `NODE_ENV=test yarn vitest run src/api/github src/api/http`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/api/http/github.ts src/api/http/clients.test.ts src/api/github/queries.ts src/api/github/queries.test.ts src/api/github/notifications.ts src/api/github/index.ts src/api/github/costs.test.ts
git commit -m "perf(mentions): check every thread's open state in one GraphQL request

Up to 50 REST GETs per check (on load, and every 30 minutes for open
threads) become one aliased GraphQL query; a deleted repo nulls its own
alias instead of failing the batch.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run the full gate**

Run: `NODE_ENV=test yarn test && yarn lint && yarn typecheck`
Expected: all pass. Fix anything that doesn't before going on, and commit fixes with the task they belong to.

- [ ] **Step 2: Hand the user a by-eye checklist** (no Playwright; the user runs it in the real app with DevTools → Network, filtered to `api.github.com` and `jira-proxy`)

1. A cold Workday load in Focus: one `search/jql` assigned query, and no separate sprint or off-sprint queries. Two GitHub GraphQL merged searches become one. No `protection/required_status_checks` calls if checks were resolved in the last day.
2. Reload within 30 minutes: `/notifications` answers **304**. There are no `/issues/comments/…` or `/pulls/N` GETs and no `SubjectStates` request.
3. Switch Focus → List: one Jira `search/jql` (done-since) and one GraphQL reviewed-since appear only then.
4. My PRs → Recently Merged right after Workday: no new request.
5. Workday still shows sprint and off-sprint pills, Not started (sprint vs off-sprint), Merged recently, and Standup's done list as before.
