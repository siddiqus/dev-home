# API call reduction

Date: 2026-11-04 · Status: design agreed, plan pending review
(`docs/superpowers/plans/2026-11-04-api-call-reduction.md`)

## Goal

Make fewer GitHub and Jira calls, and fetch only what a view actually shows. This comes before
Workday notifications (`2026-11-04-workday-notifications-design.md`), which will be built on the
leaner data.

## Where the calls go today

A cold Workday load (Focus mode). N = distinct `repo@base-branch` across my PRs and review PRs.

| Source | Calls |
|---|---|
| My PRs (`getPrs`) | 1 GraphQL + required checks (2 REST × N) |
| Reviews (`getReviews`) | 3 GraphQL + required checks for their repos |
| GitHub mentions (`getGithubMentions`) | 1 GraphQL (comments on my PRs) + 1–2 REST notification pages + **≤50 REST subject-state GETs + ≤50 REST latest-comment GETs** (the caches are in memory only, so every page load starts cold) |
| Workday stable group | Jira sprint tickets + Jira off-sprint tickets + 1 GraphQL merged (60 d, ≤100) |
| Workday since group | Jira done-since + 1 GraphQL merged (lookback, ≤20) + 1 GraphQL reviewed-since |
| Jira assigned + mentions | 1 + 1 (+ `/user/search` once per page load) |

Each 10-minute poll repeats my PRs, reviews, mentions and Jira. The required-checks cache lives
10 minutes (the same as the poll), so every poll repeats the 2N REST calls, and open mention
threads are re-checked one REST call at a time every 30 minutes.

My PRs' Recently Merged sub-tab runs a third merged search (3 days, ≤20) over the same author.

## Cuts

Ordered smallest-first, which is also the build order. Each one can ship on its own.

### Cut 1: Required checks cached for a day

`REQUIRED_CONTEXTS_TTL_MS` goes from 10 minutes to 24 hours (`src/api/github/requiredContexts.ts`).
Answers are already saved to localStorage for 7 days and served stale-while-revalidate. A settings
save still clears them.

Trade-off: if a repo adds a newly required check, the PR's CI status reflects it within a day.

Saves 2N REST calls per poll.

### Cut 2: One merged-PR list

- New `fetchMyMergedPRs(refreshKey)` in `src/services/github.ts`: one search for my PRs merged in
  the last `MY_MERGED_DAYS` (60), `first: 100`. It's cached for 5 minutes per `refreshKey`, so
  whichever view asks first after a refresh fetches it for the others. This one list feeds Workday's
  views:
  - **Workday, PRs under tickets** (`ticketMerged`): the list as-is.
  - **Workday, Merged recently / Standup / done** (`merged`): derived in `useWorkdayExtras` by
    keeping `merged_at >= since`. `fetchWorkdaySince` drops its merged search. The longest lookback
    is 7 days, well inside 60.
  - **My PRs, Recently Merged** is deferred (Workday-only pass). It keeps its own 3-day search for
    now.
- A `refreshKey` bump still forces a refetch. A lookback change no longer refetches merged PRs,
  because that list is derived.
- `merged` mirrors `ticketMerged`'s loading and error state.
- Fixes a quiet bug: Merged recently was capped at 20 results.
- Org-scope `fetchRecentlyMergedPRs` (All PRs, Team PRs) is unchanged.

Saves 1 GraphQL call per Workday load, and 1 more when My PRs' Merged tab opens within 5 minutes.

### Cut 3: Standup-only data on demand

`doneTickets` (Jira) and `reviewed` (GitHub) only feed Standup (List renders the Focus lists and
never reads them). They load the first time Workday is shown in Standup mode, not when Focus or List
mounts. After that they follow the existing lookback and refresh rules. A phone (always Focus) never
loads them.

`useWorkdayExtras` takes `needsDone: boolean` (mode is Standup) and gates its since-effect on it.
While unrequested, both parts read as loading, so nothing in Focus or List waits on them (neither
reads them).

Saves 1 Jira and 1 GraphQL call per Workday load in Focus or List.

### Cut 4: One Jira query for assigned tickets

The assigned-issues source (`getIssues`), Workday's sprint tickets and Workday's off-sprint tickets
are three "assigned to me, unresolved" queries. They become one:

- JQL: `assignee = currentUser() AND resolution = Unresolved AND statusCategory != Done AND
  (updated >= -90d OR sprint in openSprints()) ORDER BY updated DESC`.
- Fields: `BASE_ISSUE_FIELDS` plus sprint, story points and flagged, for this query only. By-key
  lookups and JQL search keep the base fields.
- `mapIssue` adds `openSprint?: string | null` (the active sprint's name, else the first non-closed
  one, else null), `points?: number | null` and `flagged?: boolean`. These are set only when the
  fields were requested. They stay `undefined` elsewhere, so other lists never read "no sprint".
- Workday derives both parts from `assignedJiraIssues` with a pure function:
  - **sprint**: issues with a non-null `openSprint`, mapped to `SprintTicket`.
  - **offSprint**: issues with `openSprint === null`, updated in the last 60 days, mapped to
    `OffSprintTicket`.

  Both read as loading until the `jiraIssues` source has loaded this session. That way a cached
  list from before this change, which lacks the fields, never yields a wrong split.
- `fetchWorkdayStable` drops both Jira calls. Sprint data now also refreshes with the regular poll.

Accepted behaviour differences:

- Sprint tickets now also need `resolution = Unresolved`, so a resolved ticket whose status isn't
  Done drops off.
- Off-sprint tickets now also need `statusCategory != Done`.
- My Issues now includes open-sprint tickets not updated in 90 days.

Saves 2 Jira calls per Workday load.

### Cut 5: GitHub mentions remember what they've seen

**5a. Save the mention caches.** The notification list (with its `Last-Modified`), per-thread
subject states and per-thread latest comments are saved to localStorage under
`dev-home-mentions-cache` as `{ owner, notifications: { since, lastModified, list }, subjects,
comments }`.

- `owner` is the GitHub username. A different owner means the save is ignored.
- Loaded once per page load. Written once at the end of each `getGithubMentions` run, not per
  thread.
- Notifications are trimmed to the fields used: `id`, `reason`, `updated_at`,
  `repository.full_name`, and `subject.{type,title,url,latest_comment_url}`.
- Still bounded by `MAX_MENTION_THREADS` through `pruneMentionsCache`.
- `resetMentionsCache` (on settings change) also removes the key. Quota errors are swallowed.

The first notifications request after a reload is then conditional (a free 304 when nothing
changed). Threads whose `updated_at` hasn't moved need no calls.

**5b. One GraphQL query for open-state checks.** `filterOpenNotifications` collects the threads that
need a check: not cached, `updated_at` changed, or "open" for over 30 minutes. It asks about all of
them in one aliased GraphQL request, built with variables (no string interpolation):

```graphql
s0: repository(owner: $o0, name: $r0) {
  issueOrPullRequest(number: $n0) {
    __typename
    ... on PullRequest { prState: state databaseId url body createdAt updatedAt author { __typename login avatarUrl } }
    ... on Issue       { issueState: state databaseId url body createdAt updatedAt author { __typename login avatarUrl } }
  }
}
```

- The query aliases the state field per fragment (`prState: state` / `issueState: state`) because
  PullRequestState and IssueState are different enums.
- Author carries `__typename` so bots keep their `[bot]` suffix (GraphQL returns `renovate`, not
  `renovate[bot]` — the typename check lets us append it).
- `OPEN` means open. `CLOSED` or `MERGED` means closed.
- A subject without an issue/PR number (release, commit, discussion) is kept unchecked. Today's REST
  check treats it as open too, because those payloads have no `state`.
- `githubGraphql` gets an `allowPartial` option that returns `data` despite `errors` (it throws only
  when `data` is null). A null alias (deleted repo, no access) keeps its thread uncached, matching
  today's fail-open. If the whole request fails, every thread is kept and none is cached.
- When `latest_comment_url` equals the subject URL (the PR or issue itself is the latest event), the
  mention is built from the GraphQL subject (`databaseId → id`, `url → html_url`, `body`, times,
  author). This replaces the old `_subject` REST reuse.

Latest comments still come one REST call per changed thread. GraphQL can't look a comment up by its
REST URL. With 5a, that's a one-time cost per thread update.

## Not changing

- **The 3 review searches.** GitHub search can't OR different qualifiers. Aliasing them into one
  request costs the same rate-limit points and is slower (see the comment in `getReviews`).
- **The comments-on-my-PRs query.** It's kept apart from the my-PRs query on purpose, so My PRs'
  list query stays light. Folding it in would save at most 1 call per poll and slow My PRs.
- **PR-ticket enrichment** (`fetchIssuesByKeys`): already batched at 50 keys per call.
- **The 10-minute poll cadence.**

## Expected effect

| | Before | After |
|---|---|---|
| Cold Workday load (Focus or List), cache saved < 30 min ago | 8 GraphQL, 2N + 1–2 + up to 100 REST, 6–7 Jira | 6 GraphQL, 1 REST (304) + changed threads, 2–3 Jira |
| Cold Workday load, cache older than 30 min | same as above | + 1 GraphQL (open-state batch) |
| Each 10-minute poll | 5 GraphQL, 2N + 1 REST + ≤50 REST every 30 min + changed threads, Jira | 5 GraphQL (+1 every 30 min), 1 REST + changed threads, Jira |

## Testing

- **Call-count tests per cut** with the existing `httpMock` adapter (pattern:
  `src/api/github/costs.test.ts`). They count requests by endpoint for each scenario: cold, warm
  (saved cache), and poll.
- **Unit tests** for the derivations: the merged since-filter, the sprint/off-sprint split, the
  partial-GraphQL handling, the trimmed notification round-trip, and Issue vs PullRequest handling.
- Full suite under `NODE_ENV=test`, plus `yarn lint` and `yarn typecheck`. The UI is checked by eye
  in the real app; no Playwright (the app needs real tokens).
