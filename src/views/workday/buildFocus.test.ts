import { describe, it, expect } from "vitest";
import type { GitHubComment, GitHubPR, JiraComment } from "../../types";
import { buildFocus } from "./buildFocus";
import type { FocusInputs, TicketRef } from "./types";

const NOW = new Date("2026-10-12T10:00:00Z");

function pr(n: number, o: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: n,
    number: n,
    title: `PR ${n}`,
    html_url: `https://github.com/o/r/pull/${n}`,
    state: "open",
    draft: false,
    created_at: "2026-10-09T10:00:00Z",
    updated_at: "2026-10-10T10:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: `feature/x-${n}` },
    base: { ref: "main" },
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    requested_reviewers: ["guru"],
    ...o,
  };
}

const theirs = (n: number, o: Partial<GitHubPR> = {}) =>
  pr(n, { user: { login: "abu", avatar_url: "" }, requested_reviewers: ["me"], ...o });

const ticket = (key: string, o: Partial<TicketRef> = {}): TicketRef => ({
  key,
  summary: `Summary ${key}`,
  statusName: "In Progress",
  offSprint: false,
  updated: null,
  ...o,
});

function ghMention(id: number, o: Partial<GitHubComment> = {}): GitHubComment {
  return {
    id,
    html_url: `https://github.com/o/r/pull/7#issuecomment-${id}`,
    body: "@me can you look?",
    created_at: "2026-10-11T10:00:00Z",
    updated_at: "2026-10-11T10:00:00Z",
    user: { login: "abu", avatar_url: "" },
    pr_number: 7,
    repo_full_name: "o/repo",
    context_title: "CCP-7 Add thing",
    reason: "mention",
    ...o,
  };
}

function jiraMention(id: string, o: Partial<JiraComment> = {}): JiraComment {
  return {
    id,
    author: { displayName: "Tomas", avatarUrls: { "48x48": "" } },
    body: { text: "ping @me" },
    created: "2026-10-11T09:00:00Z",
    updated: "2026-10-11T09:00:00Z",
    issueKey: "WMU-5",
    issueSummary: "Something",
    ...o,
  };
}

function inputs(o: Partial<FocusInputs> = {}): FocusInputs {
  return {
    openPRs: [],
    reviewRequests: [],
    reviewingPRs: [],
    workingOn: [],
    githubMentions: [],
    jiraMentions: [],
    ...o,
  };
}

const needs = (o: Partial<FocusInputs>) =>
  buildFocus(inputs(o), NOW).needs.map((i) => [i.tier, i.verb, i.pr.number]);

describe("buildFocus needs", () => {
  it("is empty when nothing needs me", () => {
    const f = buildFocus(inputs({ openPRs: [pr(1)] }), NOW);
    expect(f.needs).toEqual([]);
    expect(buildFocus(inputs(), NOW)).toEqual({
      pinned: [],
      needs: [],
      mentions: [],
      working: [],
      waiting: { onReviewers: [], onAuthor: [], approved: [] },
    });
  });

  it("Fix CI names the failing checks", () => {
    const f = buildFocus(
      inputs({
        openPRs: [
          pr(1, {
            title: "CCP-1 red",
            updated_at: "2026-10-08T10:00:00Z",
            checks_status: "FAILURE",
            checks: [
              { name: "lint", status: "FAILURE", url: null },
              { name: "unit", status: "ERROR", url: null },
              { name: "build", status: "SUCCESS", url: null },
            ],
          }),
          pr(2, { checks_status: "FAILURE", updated_at: "2026-10-09T10:00:00Z" }),
        ],
      }),
      NOW,
    );
    expect(f.needs.map((i) => [i.verb, i.tone, i.reason, i.ticketKey])).toEqual([
      ["Fix CI", "danger", "lint + unit failing", "CCP-1"],
      ["Fix CI", "danger", "CI failing", null],
    ]);
  });

  it("Fix CI collapses more than two failing checks", () => {
    const f = buildFocus(
      inputs({
        openPRs: [
          pr(1, {
            checks_status: "FAILURE",
            checks: ["a", "b", "c", "d"].map((name) => ({ name, status: "FAILURE", url: null })),
          }),
        ],
      }),
      NOW,
    );
    expect(f.needs[0].reason).toBe("a + b +2 failing");
  });

  it("Resolve conflict, Address feedback and Request review", () => {
    const f = buildFocus(
      inputs({
        openPRs: [
          pr(1, { has_conflict: true, updated_at: "2026-10-10T01:00:00Z" }),
          pr(2, { review_status: "CHANGES_REQUESTED", updated_at: "2026-10-10T02:00:00Z" }),
          pr(3, { requested_reviewers: [], updated_at: "2026-10-09T01:00:00Z" }),
        ],
      }),
      NOW,
    );
    expect(f.needs.map((i) => [i.verb, i.tone, i.reason])).toEqual([
      ["Resolve conflict", "danger", "conflicts with main"],
      ["Address feedback", "danger", "changes requested"],
      ["Request review", "warning", "no reviewer assigned"],
    ]);
  });

  it("does not ask for a reviewer when reviews exist or reviewers are unknown", () => {
    expect(
      needs({
        openPRs: [
          pr(1, { requested_reviewers: [], review_status: "REVIEWED" }),
          pr(2, { requested_reviewers: undefined }),
        ],
      }),
    ).toEqual([]);
  });

  it("Review includes the author and diff size", () => {
    const f = buildFocus(
      inputs({
        reviewRequests: [
          theirs(1, { additions: 120, deletions: 4 }),
          theirs(2, { updated_at: "2026-10-09T10:00:00Z" }),
        ],
      }),
      NOW,
    );
    expect(f.needs.map((i) => [i.tier, i.verb, i.tone, i.reason])).toEqual([
      ["others", "Review", "info", "abu requested · +120 −4"],
      ["others", "Review", "info", "abu requested"],
    ]);
  });

  it("Re-review when re-requested (viewer_engaged)", () => {
    const f = buildFocus(inputs({ reviewRequests: [theirs(1, { viewer_engaged: true })] }), NOW);
    expect(f.needs.map((i) => [i.verb, i.tone, i.reason])).toEqual([
      ["Re-review", "warning", "abu re-requested"],
    ]);
  });

  it("Re-review on new commits since my non-approving review, not after approving", () => {
    const f = buildFocus(
      inputs({
        reviewingPRs: [
          theirs(1, { new_commits_since_review: true, viewer_review_state: "CHANGES_REQUESTED" }),
          theirs(2, {
            new_commits_since_review: true,
            viewer_review_state: "COMMENTED",
            updated_at: "2026-10-09T10:00:00Z",
          }),
          theirs(3, { new_commits_since_review: true, viewer_review_state: "APPROVED" }),
          theirs(4, { new_commits_since_review: false, viewer_review_state: "COMMENTED" }),
        ],
      }),
      NOW,
    );
    expect(f.needs.map((i) => [i.verb, i.pr.number, i.reason])).toEqual([
      ["Re-review", 1, "new commits since your review"],
      ["Re-review", 2, "new commits since your review"],
    ]);
  });

  it("counts a PR in both reviewRequests and reviewingPRs once", () => {
    const shared = theirs(1, {
      new_commits_since_review: true,
      viewer_review_state: "COMMENTED",
      viewer_engaged: true,
    });
    expect(needs({ reviewRequests: [shared], reviewingPRs: [{ ...shared }] })).toEqual([
      ["others", "Re-review", 1],
    ]);
  });

  it("Merge when approved, CI green, no conflict and not queued", () => {
    const ok = { review_status: "APPROVED", checks_status: "SUCCESS" } as const;
    const f = buildFocus(inputs({ openPRs: [pr(1, ok)] }), NOW);
    expect(f.needs.map((i) => [i.tier, i.verb, i.tone, i.reason])).toEqual([
      ["ship", "Merge", "success", "approved · CI green"],
    ]);

    expect(needs({ openPRs: [pr(1, { ...ok, review_status: null })] })).toEqual([]);
    expect(needs({ openPRs: [pr(1, { ...ok, checks_status: "PENDING" })] })).toEqual([]);
    expect(needs({ openPRs: [pr(1, { ...ok, checks_status: null })] })).toEqual([]);
    expect(needs({ openPRs: [pr(1, { ...ok, in_merge_queue: true })] })).toEqual([]);
    // A conflict turns Merge into Resolve conflict.
    expect(needs({ openPRs: [pr(1, { ...ok, has_conflict: true })] })).toEqual([
      ["self", "Resolve conflict", 1],
    ]);
  });

  it("excludes my drafts", () => {
    expect(
      needs({
        openPRs: [
          pr(1, { draft: true, checks_status: "FAILURE" }),
          pr(2, { draft: true, has_conflict: true }),
          pr(3, { draft: true, requested_reviewers: [] }),
          pr(4, { draft: true, review_status: "APPROVED", checks_status: "SUCCESS" }),
        ],
      }),
    ).toEqual([]);
  });

  it("lists every issue on a PR, worst first, and leads with the worst", () => {
    const f = buildFocus(
      inputs({
        openPRs: [
          pr(1, {
            checks_status: "FAILURE",
            has_conflict: true,
            review_status: "CHANGES_REQUESTED",
            unresolved_thread_count: 3,
          }),
        ],
      }),
      NOW,
    );
    const [item] = f.needs;
    expect([item.verb, item.tone, item.reason]).toEqual(["Fix CI", "danger", "CI failing"]);
    expect(item.issues.map((i) => [i.verb, i.tone, i.reason])).toEqual([
      ["Fix CI", "danger", "CI failing"],
      ["Resolve conflict", "danger", "conflicts with main"],
      ["Address feedback", "danger", "changes requested · 3 threads"],
    ]);
  });

  it("unresolved threads: own issue alone, folded into a comment review", () => {
    const f = buildFocus(
      inputs({
        openPRs: [
          pr(1, { unresolved_thread_count: 1, updated_at: "2026-10-09T10:00:00Z" }),
          pr(2, { review_status: "REVIEWED", unresolved_thread_count: 2 }),
        ],
      }),
      NOW,
    );
    expect(f.needs.map((i) => i.issues.map((x) => [x.verb, x.tone, x.reason]))).toEqual([
      [["Resolve threads", "warning", "1 unresolved thread"]],
      [["Address feedback", "warning", "reviewed · 2 threads"]],
    ]);
  });

  it("a comment review with no open threads is not an issue", () => {
    expect(needs({ openPRs: [pr(1, { review_status: "REVIEWED" })] })).toEqual([]);
    const w = buildFocus(
      inputs({ openPRs: [pr(1, { review_status: "REVIEWED", unresolved_thread_count: 0 })] }),
      NOW,
    ).waiting.onReviewers;
    expect(w.map((x) => x.pr.number)).toEqual([1]);
  });

  it("keeps PRs with threads out of waiting on reviewers", () => {
    const f = buildFocus(inputs({ openPRs: [pr(1, { unresolved_thread_count: 2 })] }), NOW);
    expect(f.waiting.onReviewers).toEqual([]);
  });

  it("ranks own PRs by danger count, then warning count, then oldest first", () => {
    expect(
      needs({
        openPRs: [
          // 1 warning
          pr(1, { requested_reviewers: [], updated_at: "2026-10-01T00:00:00Z" }),
          // 1 danger, newer
          pr(2, { has_conflict: true, updated_at: "2026-10-11T00:00:00Z" }),
          // 1 danger + 1 warning
          pr(3, {
            checks_status: "FAILURE",
            requested_reviewers: [],
            updated_at: "2026-10-12T00:00:00Z",
          }),
          // 2 dangers
          pr(4, {
            checks_status: "FAILURE",
            has_conflict: true,
            updated_at: "2026-10-12T09:00:00Z",
          }),
          // 1 danger, older
          pr(5, { checks_status: "FAILURE", updated_at: "2026-10-05T00:00:00Z" }),
          // 2 warnings beat 1 warning but not a danger
          pr(6, {
            unresolved_thread_count: 1,
            requested_reviewers: [],
            updated_at: "2026-10-12T00:00:00Z",
          }),
        ],
      }),
    ).toEqual([
      ["self", "Fix CI", 4],
      ["self", "Fix CI", 3],
      ["self", "Fix CI", 5],
      ["self", "Resolve conflict", 2],
      ["self", "Resolve threads", 6],
      ["self", "Request review", 1],
    ]);
  });

  it("orders tiers ship → self → others; ship and others newest first", () => {
    expect(
      needs({
        openPRs: [
          pr(1, {
            review_status: "APPROVED",
            checks_status: "SUCCESS",
            updated_at: "2026-10-12T09:00:00Z",
          }),
          pr(2, { checks_status: "FAILURE", updated_at: "2026-10-01T00:00:00Z" }),
          pr(3, { has_conflict: true, updated_at: "2026-10-05T00:00:00Z" }),
          pr(4, {
            review_status: "APPROVED",
            checks_status: "SUCCESS",
            updated_at: "2026-10-03T00:00:00Z",
          }),
        ],
        reviewRequests: [
          theirs(10, { updated_at: "2026-10-02T00:00:00Z" }),
          theirs(11, { viewer_engaged: true, updated_at: "2026-10-11T00:00:00Z" }),
        ],
      }),
    ).toEqual([
      ["ship", "Merge", 1],
      ["ship", "Merge", 4],
      ["self", "Fix CI", 2],
      ["self", "Resolve conflict", 3],
      ["others", "Re-review", 11],
      ["others", "Review", 10],
    ]);
  });
});

describe("buildFocus mentions", () => {
  it("keeps the last 3 days, newest first, from both sources", () => {
    const f = buildFocus(
      inputs({
        githubMentions: [
          ghMention(1, {
            created_at: "2026-10-12T08:00:00Z",
            body: "> quoted\n\n  hey   @me\nmore",
          }),
          ghMention(2, { created_at: "2026-10-08T09:59:00Z" }), // just over 3 days
          ghMention(3, { created_at: "2026-10-09T10:00:00Z", context_title: "No key" }), // exactly 3 days
        ],
        jiraMentions: [jiraMention("j1", { created: "2026-10-11T12:00:00Z" })],
      }),
      NOW,
    );
    expect(f.mentions.map((m) => m.id)).toEqual(["gh:1", "jira:j1", "gh:3"]);
    expect(f.mentions[0]).toEqual({
      id: "gh:1",
      source: "GitHub",
      who: "abu",
      ticketKey: "CCP-7",
      where: "repo#7",
      snippet: "hey @me",
      at: "2026-10-12T08:00:00Z",
      url: "https://github.com/o/r/pull/7#issuecomment-1",
    });
    expect(f.mentions[1]).toEqual({
      id: "jira:j1",
      source: "Jira",
      who: "Tomas",
      ticketKey: "WMU-5",
      where: "WMU-5",
      snippet: "ping @me",
      at: "2026-10-11T12:00:00Z",
      url: "",
    });
    expect(f.mentions[2].ticketKey).toBeNull();
  });
});

describe("buildFocus working", () => {
  it("badges each ticket with its worst PR state and splits ticketless PRs", () => {
    const f = buildFocus(
      inputs({
        workingOn: [
          {
            ticket: ticket("CCP-1"),
            prs: [
              pr(1, {
                title: "CCP-1 a",
                review_status: "APPROVED",
                updated_at: "2026-10-11T00:00:00Z",
              }),
              pr(2, { title: "CCP-1 b", has_conflict: true, updated_at: "2026-10-10T00:00:00Z" }),
            ],
          },
          { ticket: ticket("CCP-2", { updated: "2026-10-09T00:00:00Z" }), prs: [] },
          {
            ticket: null,
            prs: [
              pr(3, { checks_status: "FAILURE", updated_at: "2026-10-12T00:00:00Z" }),
              pr(4, { draft: true, updated_at: "2026-10-08T00:00:00Z" }),
            ],
          },
        ],
      }),
      NOW,
    );
    expect(
      f.working.map((w) => [
        w.ticket?.key ?? null,
        w.prs.map((p) => p.number),
        w.state.label,
        w.at,
      ]),
    ).toEqual([
      [null, [3], "CI failing", "2026-10-12T00:00:00Z"],
      ["CCP-1", [1, 2], "Conflict", "2026-10-11T00:00:00Z"],
      ["CCP-2", [], "No PR yet", "2026-10-09T00:00:00Z"],
      [null, [4], "Draft", "2026-10-08T00:00:00Z"],
    ]);
  });
});

describe("buildFocus waiting", () => {
  it("lists my non-draft PRs waiting on reviewers", () => {
    const f = buildFocus(
      inputs({
        openPRs: [
          pr(1, { title: "CCP-1 a", requested_reviewers: ["tomas", "cmp-fe"] }),
          pr(2, { draft: true }),
          pr(3, { checks_status: "FAILURE" }), // needs action
          pr(4, { review_status: "APPROVED" }), // approved
          pr(5, { requested_reviewers: [], review_status: "REVIEWED" }), // no pending reviewer
          pr(6, { updated_at: "2026-10-11T00:00:00Z", created_at: "2026-10-01T00:00:00Z" }),
        ],
      }),
      NOW,
    );
    expect(f.waiting.onReviewers).toEqual([
      {
        pr: expect.objectContaining({ number: 6 }),
        ticketKey: null,
        reviewers: ["guru"],
        since: "2026-10-01T00:00:00Z",
      },
      {
        pr: expect.objectContaining({ number: 1 }),
        ticketKey: "CCP-1",
        reviewers: ["tomas", "cmp-fe"],
        since: "2026-10-09T10:00:00Z",
      },
    ]);
  });

  it("splits reviewed PRs into waiting-on-author and approved", () => {
    const requested = theirs(5, { viewer_review_state: "COMMENTED" });
    const f = buildFocus(
      inputs({
        reviewRequests: [requested],
        reviewingPRs: [
          theirs(1, {
            viewer_review_state: "CHANGES_REQUESTED",
            viewer_reviewed_at: "2026-10-09T00:00:00Z",
            updated_at: "2026-10-09T00:00:00Z",
          }),
          theirs(2, { viewer_review_state: "COMMENTED", updated_at: "2026-10-11T00:00:00Z" }),
          theirs(3, { viewer_review_state: "APPROVED", new_commits_since_review: true }),
          theirs(4, { viewer_review_state: "COMMENTED", new_commits_since_review: true }),
          requested,
          theirs(6, { title: "CCP-6 x" }),
        ],
      }),
      NOW,
    );
    expect(f.waiting.onAuthor.map((w) => [w.pr.number, w.state, w.at])).toEqual([
      [2, "COMMENTED", null],
      [6, null, null],
      [1, "CHANGES_REQUESTED", "2026-10-09T00:00:00Z"],
    ]);
    expect(f.waiting.onAuthor[1].ticketKey).toBe("CCP-6");
    expect(f.waiting.approved.map((w) => [w.pr.number, w.state])).toEqual([[3, "APPROVED"]]);
  });
});

describe("buildFocus pinned", () => {
  const url = (n: number) => `pr:https://github.com/o/r/pull/${n}`;
  const nums = (f: ReturnType<typeof buildFocus>) => ({
    needs: f.needs.map((i) => i.pr.number),
    working: f.working.map((w) => w.ticket?.key ?? w.prs[0].number),
    onAuthor: f.waiting.onAuthor.map((w) => w.pr.number),
  });

  it("moves a pinned PR to the top, alone, and out of its section", () => {
    const failing = pr(1, { checks_status: "FAILURE" });
    const reviewed = theirs(2, { viewer_review_state: "COMMENTED" });
    const f = buildFocus(
      inputs({ openPRs: [failing], reviewingPRs: [reviewed] }),
      NOW,
      new Set([url(1), url(2)]),
    );
    // Most recently pinned first; reviewed PRs get the reviewer state.
    expect(f.pinned.map((p) => p.kind === "pr" && [p.pr.number, p.badge.label, p.mine])).toEqual([
      [2, "Waiting on author", false],
      [1, "CI failing", true],
    ]);
    expect(nums(f)).toEqual({ needs: [], working: [], onAuthor: [] });
  });

  it("a pinned ticket gathers every open PR on it and leaves the other sections", () => {
    const mine = pr(1, { title: "CCP-9 Part one", checks_status: "FAILURE" });
    const review = theirs(2, { title: "CCP-9 Part two" });
    const other = pr(3, { title: "CCP-4 Else", checks_status: "FAILURE" });
    const f = buildFocus(
      inputs({
        openPRs: [mine, other],
        reviewRequests: [review],
        workingOn: [
          { ticket: ticket("CCP-9"), prs: [mine] },
          { ticket: ticket("CCP-4"), prs: [other] },
        ],
      }),
      NOW,
      // The ticket's own PR pin folds into the ticket.
      new Set([url(1), "ticket:CCP-9"]),
    );
    expect(f.pinned).toHaveLength(1);
    const [p] = f.pinned;
    expect(
      p.kind === "ticket" && [p.key, p.ticket?.summary, p.prs.map((x) => x.pr.number)],
    ).toEqual(["CCP-9", "Summary CCP-9", [1, 2]]);
    expect(nums(f)).toEqual({ needs: [3], working: ["CCP-4"], onAuthor: [] });
  });

  it("keeps a pinned ticket with no open PRs, and drops pins for closed PRs", () => {
    const f = buildFocus(inputs(), NOW, new Set(["ticket:CCP-1", url(99)]));
    expect(f.pinned).toEqual([{ kind: "ticket", key: "CCP-1", ticket: null, prs: [] }]);
  });

  it("drops a Working-on ticket once all its PRs are pinned", () => {
    const a = pr(1, { title: "CCP-2 A" });
    const f = buildFocus(
      inputs({ openPRs: [a], workingOn: [{ ticket: ticket("CCP-2"), prs: [a] }] }),
      NOW,
      new Set([url(1)]),
    );
    expect(f.working).toEqual([]);
    expect(f.pinned.map((p) => p.kind)).toEqual(["pr"]);
  });
});
