/**
 * Tests for load distribution — per-member ticket/WIP/stalled/done + PR counts,
 * plus team balance indicator.
 */
import { describe, it, expect } from "vitest";
import { computeLoadDistribution, computeLoadBalance } from "./load";
import type { EnrichedIssue, WorkloadEntry } from "./types";
import type { RawPR, RosterEntry } from "../teamAggregation";

const now = new Date("2026-07-02T12:00:00Z");

const roster: RosterEntry[] = [
  { accountId: "a1", displayName: "Alice", githubUsername: "alice" },
  { accountId: "a2", displayName: "Bob", githubUsername: "bob" },
  { accountId: "a3", displayName: "Charlie", githubUsername: "charlie" },
];

function makeIssue(partial: Partial<EnrichedIssue>): EnrichedIssue {
  return {
    key: partial.key || "TEST-1",
    summary: partial.summary || "Test issue",
    status: partial.status || "In Progress",
    statusCategory: partial.statusCategory || "indeterminate",
    assigneeAccountId: partial.assigneeAccountId || null,
    assigneeName: partial.assigneeName || null,
    epicKey: partial.epicKey || null,
    epicName: partial.epicName || null,
    linkedPRs: partial.linkedPRs || [],
    createdAt: partial.createdAt || "2026-06-15T00:00:00Z",
    updatedAt: partial.updatedAt || "2026-07-01T00:00:00Z",
    dueDate: partial.dueDate || null,
    storyPoints: partial.storyPoints ?? null,
    ageDays: partial.ageDays ?? 17,
    daysSinceUpdate: partial.daysSinceUpdate ?? 1,
    flags: partial.flags || {
      unassigned: false,
      noEpic: false,
      stale: false,
      addedAfterStart: false,
      dueSoon: false,
      prFailingCI: false,
      prWaitingReview: false,
      inProgressNoPR: false,
    },
    risk: partial.risk || { score: 0, level: "normal", reasons: [] },
  };
}

function makePR(partial: Partial<RawPR>): RawPR {
  return {
    number: partial.number || 1,
    title: partial.title || "Test PR",
    repo_full_name: partial.repo_full_name || "org/repo",
    html_url: partial.html_url || "https://github.com/org/repo/pull/1",
    state: partial.state || "open",
    checks_status: partial.checks_status ?? null,
    author: partial.author || "alice",
    created_at: partial.created_at || "2026-07-01T00:00:00Z",
    merged_at: partial.merged_at,
    first_review_at: partial.first_review_at,
    review_state: partial.review_state,
    review_requested: partial.review_requested,
  };
}

describe("computeLoadDistribution", () => {
  it("returns empty array for empty roster", () => {
    const result = computeLoadDistribution([], [], [], now);
    expect(result).toEqual([]);
  });

  it("computes basic ticket and PR counts per member", () => {
    const issues: EnrichedIssue[] = [
      makeIssue({ key: "T-1", assigneeAccountId: "a1", statusCategory: "new" }),
      makeIssue({ key: "T-2", assigneeAccountId: "a1", statusCategory: "indeterminate" }),
      makeIssue({ key: "T-3", assigneeAccountId: "a2", statusCategory: "done" }),
    ];
    const prs: RawPR[] = [
      makePR({ number: 1, author: "alice" }),
      makePR({ number: 2, author: "Alice" }), // case-insensitive
      makePR({ number: 3, author: "bob" }),
    ];

    const result = computeLoadDistribution(roster, issues, prs, now);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      accountId: "a1",
      displayName: "Alice",
      githubUsername: "alice",
      ticketCount: 2,
      prCount: 2,
      byStatus: { new: 1, indeterminate: 1, inReview: 0, done: 0 },
    });
    expect(result[1]).toMatchObject({
      accountId: "a2",
      ticketCount: 1,
      prCount: 1,
      byStatus: { new: 0, indeterminate: 0, inReview: 0, done: 1 },
    });
    expect(result[2]).toMatchObject({
      accountId: "a3",
      ticketCount: 0,
      prCount: 0,
      byStatus: { new: 0, indeterminate: 0, inReview: 0, done: 0 },
    });
  });

  it("computes byStatus counts via classifyStatus (including inReview)", () => {
    const issues: EnrichedIssue[] = [
      makeIssue({
        key: "T-1",
        assigneeAccountId: "a1",
        status: "To Do",
        statusCategory: "new",
      }),
      makeIssue({
        key: "T-2",
        assigneeAccountId: "a1",
        status: "In Progress",
        statusCategory: "indeterminate",
      }),
      makeIssue({
        key: "T-3",
        assigneeAccountId: "a1",
        status: "In Review",
        statusCategory: "indeterminate",
      }),
      makeIssue({
        key: "T-4",
        assigneeAccountId: "a1",
        status: "Done",
        statusCategory: "done",
      }),
    ];

    const result = computeLoadDistribution(roster, issues, [], now);

    expect(result[0].byStatus).toEqual({ new: 1, indeterminate: 1, inReview: 1, done: 1 });
  });

  it("computes wip and doneCount from byStatus", () => {
    const issues: EnrichedIssue[] = [
      makeIssue({ key: "T-1", assigneeAccountId: "a1", statusCategory: "new" }),
      makeIssue({ key: "T-2", assigneeAccountId: "a1", statusCategory: "indeterminate" }),
      makeIssue({
        key: "T-3",
        assigneeAccountId: "a1",
        status: "In Review",
        statusCategory: "indeterminate",
      }),
      makeIssue({ key: "T-4", assigneeAccountId: "a1", statusCategory: "done" }),
      makeIssue({ key: "T-5", assigneeAccountId: "a1", statusCategory: "done" }),
    ];

    const result = computeLoadDistribution(roster, issues, [], now);

    // wip = indeterminate + inReview = 1 + 1 = 2
    expect(result[0].wip).toBe(2);
    expect(result[0].doneCount).toBe(2);
  });

  it("computes stalledCount from flags.stale", () => {
    const issues: EnrichedIssue[] = [
      makeIssue({
        key: "T-1",
        assigneeAccountId: "a1",
        flags: {
          unassigned: false,
          noEpic: false,
          stale: true,
          addedAfterStart: false,
          dueSoon: false,
          prFailingCI: false,
          prWaitingReview: false,
          inProgressNoPR: false,
        },
      }),
      makeIssue({
        key: "T-2",
        assigneeAccountId: "a1",
        flags: {
          unassigned: false,
          noEpic: false,
          stale: true,
          addedAfterStart: false,
          dueSoon: false,
          prFailingCI: false,
          prWaitingReview: false,
          inProgressNoPR: false,
        },
      }),
      makeIssue({
        key: "T-3",
        assigneeAccountId: "a1",
        flags: {
          unassigned: false,
          noEpic: false,
          stale: false,
          addedAfterStart: false,
          dueSoon: false,
          prFailingCI: false,
          prWaitingReview: false,
          inProgressNoPR: false,
        },
      }),
    ];

    const result = computeLoadDistribution(roster, issues, [], now);

    expect(result[0].stalledCount).toBe(2);
  });

  it("computes avgDaysSinceUpdate for in-progress issues only (statusCategory=indeterminate)", () => {
    const issues: EnrichedIssue[] = [
      makeIssue({
        key: "T-1",
        assigneeAccountId: "a1",
        statusCategory: "indeterminate",
        daysSinceUpdate: 5,
      }),
      makeIssue({
        key: "T-2",
        assigneeAccountId: "a1",
        statusCategory: "indeterminate",
        daysSinceUpdate: 3,
      }),
      // Done issue: should be ignored for avgDaysSinceUpdate
      makeIssue({
        key: "T-3",
        assigneeAccountId: "a1",
        statusCategory: "done",
        daysSinceUpdate: 100,
      }),
      // New issue: should be ignored
      makeIssue({
        key: "T-4",
        assigneeAccountId: "a1",
        statusCategory: "new",
        daysSinceUpdate: 50,
      }),
    ];

    const result = computeLoadDistribution(roster, issues, [], now);

    // avg = (5 + 3) / 2 = 4.0
    expect(result[0].avgDaysSinceUpdate).toBe(4.0);
  });

  it("sets avgDaysSinceUpdate to 0 when no in-progress issues", () => {
    const issues: EnrichedIssue[] = [
      makeIssue({ key: "T-1", assigneeAccountId: "a1", statusCategory: "done" }),
    ];

    const result = computeLoadDistribution(roster, issues, [], now);

    expect(result[0].avgDaysSinceUpdate).toBe(0);
  });

  it("rounds avgDaysSinceUpdate to 1 decimal", () => {
    const issues: EnrichedIssue[] = [
      makeIssue({
        key: "T-1",
        assigneeAccountId: "a1",
        statusCategory: "indeterminate",
        daysSinceUpdate: 5,
      }),
      makeIssue({
        key: "T-2",
        assigneeAccountId: "a1",
        statusCategory: "indeterminate",
        daysSinceUpdate: 4,
      }),
      makeIssue({
        key: "T-3",
        assigneeAccountId: "a1",
        statusCategory: "indeterminate",
        daysSinceUpdate: 3,
      }),
    ];

    const result = computeLoadDistribution(roster, issues, [], now);

    // avg = (5 + 4 + 3) / 3 = 4.0
    expect(result[0].avgDaysSinceUpdate).toBe(4.0);
  });

  it("computes stalest as the in-progress issue with max daysSinceUpdate", () => {
    const issues: EnrichedIssue[] = [
      makeIssue({
        key: "T-1",
        assigneeAccountId: "a1",
        statusCategory: "indeterminate",
        daysSinceUpdate: 5,
      }),
      makeIssue({
        key: "T-2",
        assigneeAccountId: "a1",
        statusCategory: "indeterminate",
        daysSinceUpdate: 10,
      }),
      makeIssue({
        key: "T-3",
        assigneeAccountId: "a1",
        statusCategory: "indeterminate",
        daysSinceUpdate: 3,
      }),
      // Done issue with higher daysSinceUpdate: should be ignored
      makeIssue({
        key: "T-4",
        assigneeAccountId: "a1",
        statusCategory: "done",
        daysSinceUpdate: 100,
      }),
    ];

    const result = computeLoadDistribution(roster, issues, [], now);

    expect(result[0].stalest).toEqual({ kind: "issue", key: "T-2" });
  });

  it("sets stalest to null when no in-progress issues", () => {
    const issues: EnrichedIssue[] = [
      makeIssue({ key: "T-1", assigneeAccountId: "a1", statusCategory: "done" }),
    ];

    const result = computeLoadDistribution(roster, issues, [], now);

    expect(result[0].stalest).toBeNull();
  });

  it("computes prOpen, prMerged, prReviewing counts", () => {
    const prs: RawPR[] = [
      makePR({ number: 1, author: "alice", state: "open" }),
      makePR({
        number: 2,
        author: "alice",
        state: "open",
        review_requested: true,
      }),
      makePR({
        number: 3,
        author: "alice",
        state: "open",
        review_state: "REVIEW_REQUIRED",
      }),
      makePR({
        number: 4,
        author: "alice",
        state: "closed",
        merged_at: "2026-07-01T00:00:00Z",
      }),
      makePR({
        number: 5,
        author: "alice",
        state: "merged",
        merged_at: "2026-07-01T00:00:00Z",
      }),
      makePR({ number: 6, author: "alice", state: "closed" }), // closed but not merged
    ];

    const result = computeLoadDistribution(roster, [], prs, now);

    expect(result[0].prOpen).toBe(3); // PRs 1, 2, 3
    expect(result[0].prMerged).toBe(2); // PRs 4, 5
    expect(result[0].prReviewing).toBe(2); // PRs 2, 3 (open + review_requested or review_state)
  });

  it("computes riskLevel as the highest risk.level among member issues", () => {
    const issues: EnrichedIssue[] = [
      makeIssue({
        key: "T-1",
        assigneeAccountId: "a1",
        risk: { score: 1, level: "normal", reasons: [] },
      }),
      makeIssue({
        key: "T-2",
        assigneeAccountId: "a1",
        risk: { score: 3, level: "attention", reasons: [] },
      }),
      makeIssue({
        key: "T-3",
        assigneeAccountId: "a2",
        risk: { score: 5, level: "high", reasons: [] },
      }),
      makeIssue({
        key: "T-4",
        assigneeAccountId: "a2",
        risk: { score: 2, level: "normal", reasons: [] },
      }),
    ];

    const result = computeLoadDistribution(roster, issues, [], now);

    expect(result[0].riskLevel).toBe("attention"); // Alice: max(normal, attention) = attention
    expect(result[1].riskLevel).toBe("high"); // Bob: max(high, normal) = high
    expect(result[2].riskLevel).toBe("normal"); // Charlie: no issues
  });

  it("handles complex scenario: stalled + in-progress mix", () => {
    const issues: EnrichedIssue[] = [
      makeIssue({
        key: "T-1",
        assigneeAccountId: "a1",
        statusCategory: "indeterminate",
        daysSinceUpdate: 7,
        flags: {
          unassigned: false,
          noEpic: false,
          stale: true,
          addedAfterStart: false,
          dueSoon: false,
          prFailingCI: false,
          prWaitingReview: false,
          inProgressNoPR: false,
        },
        risk: { score: 4, level: "attention", reasons: [] },
      }),
      makeIssue({
        key: "T-2",
        assigneeAccountId: "a1",
        statusCategory: "indeterminate",
        daysSinceUpdate: 2,
        flags: {
          unassigned: false,
          noEpic: false,
          stale: false,
          addedAfterStart: false,
          dueSoon: false,
          prFailingCI: false,
          prWaitingReview: false,
          inProgressNoPR: false,
        },
        risk: { score: 1, level: "normal", reasons: [] },
      }),
      makeIssue({
        key: "T-3",
        assigneeAccountId: "a1",
        statusCategory: "done",
        daysSinceUpdate: 10,
        flags: {
          unassigned: false,
          noEpic: false,
          stale: false,
          addedAfterStart: false,
          dueSoon: false,
          prFailingCI: false,
          prWaitingReview: false,
          inProgressNoPR: false,
        },
        risk: { score: 0, level: "normal", reasons: [] },
      }),
    ];

    const result = computeLoadDistribution(roster, issues, [], now);

    expect(result[0].stalledCount).toBe(1); // T-1
    expect(result[0].avgDaysSinceUpdate).toBe(4.5); // (7 + 2) / 2
    expect(result[0].stalest).toEqual({ kind: "issue", key: "T-1" });
    expect(result[0].riskLevel).toBe("attention"); // max(attention, normal, normal)
  });
});

describe("computeLoadBalance", () => {
  it("returns zeros for empty workload", () => {
    const result = computeLoadBalance([]);
    expect(result).toEqual({ max: 0, min: 0, imbalance: 0 });
  });

  it("computes max, min, and imbalance from ticketCount", () => {
    const workload: WorkloadEntry[] = [
      {
        accountId: "a1",
        displayName: "Alice",
        githubUsername: "alice",
        ticketCount: 5,
        prCount: 0,
        byStatus: { new: 0, indeterminate: 0, inReview: 0, done: 0 },
        wip: 0,
        doneCount: 0,
        stalledCount: 0,
        avgDaysSinceUpdate: 0,
        stalest: null,
        prOpen: 0,
        prReviewing: 0,
        prMerged: 0,
        riskLevel: "normal",
      },
      {
        accountId: "a2",
        displayName: "Bob",
        githubUsername: "bob",
        ticketCount: 2,
        prCount: 0,
        byStatus: { new: 0, indeterminate: 0, inReview: 0, done: 0 },
        wip: 0,
        doneCount: 0,
        stalledCount: 0,
        avgDaysSinceUpdate: 0,
        stalest: null,
        prOpen: 0,
        prReviewing: 0,
        prMerged: 0,
        riskLevel: "normal",
      },
      {
        accountId: "a3",
        displayName: "Charlie",
        githubUsername: "charlie",
        ticketCount: 8,
        prCount: 0,
        byStatus: { new: 0, indeterminate: 0, inReview: 0, done: 0 },
        wip: 0,
        doneCount: 0,
        stalledCount: 0,
        avgDaysSinceUpdate: 0,
        stalest: null,
        prOpen: 0,
        prReviewing: 0,
        prMerged: 0,
        riskLevel: "normal",
      },
    ];

    const result = computeLoadBalance(workload);

    expect(result.max).toBe(8);
    expect(result.min).toBe(2);
    expect(result.imbalance).toBe(6);
  });

  it("returns zero imbalance when all members have same ticketCount", () => {
    const workload: WorkloadEntry[] = [
      {
        accountId: "a1",
        displayName: "Alice",
        githubUsername: "alice",
        ticketCount: 3,
        prCount: 0,
        byStatus: { new: 0, indeterminate: 0, inReview: 0, done: 0 },
        wip: 0,
        doneCount: 0,
        stalledCount: 0,
        avgDaysSinceUpdate: 0,
        stalest: null,
        prOpen: 0,
        prReviewing: 0,
        prMerged: 0,
        riskLevel: "normal",
      },
      {
        accountId: "a2",
        displayName: "Bob",
        githubUsername: "bob",
        ticketCount: 3,
        prCount: 0,
        byStatus: { new: 0, indeterminate: 0, inReview: 0, done: 0 },
        wip: 0,
        doneCount: 0,
        stalledCount: 0,
        avgDaysSinceUpdate: 0,
        stalest: null,
        prOpen: 0,
        prReviewing: 0,
        prMerged: 0,
        riskLevel: "normal",
      },
    ];

    const result = computeLoadBalance(workload);

    expect(result.max).toBe(3);
    expect(result.min).toBe(3);
    expect(result.imbalance).toBe(0);
  });
});
