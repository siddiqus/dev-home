/**
 * Tests for PR flow metrics.
 */
import { describe, it, expect } from "vitest";
import { computePrFlow } from "./prFlow";
import type { RawPR } from "../aggregation";
import type { EnrichedIssue } from "./types";

describe("computePrFlow", () => {
  const now = new Date("2026-07-02T12:00:00Z");

  it("counts open PRs (state === open)", () => {
    const prs: RawPR[] = [
      {
        number: 1,
        title: "PROJ-1 foo",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: null,
        author: "alice",
        created_at: "2026-07-01T10:00:00Z",
      },
      {
        number: 2,
        title: "PROJ-2 bar",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: null,
        author: "bob",
        created_at: "2026-07-01T11:00:00Z",
      },
      {
        number: 3,
        title: "PROJ-3 baz",
        repo_full_name: "org/repo",
        html_url: "",
        state: "closed",
        checks_status: null,
        author: "charlie",
        created_at: "2026-06-30T09:00:00Z",
      },
    ];
    const result = computePrFlow(prs, [], now);
    expect(result.open).toBe(2);
  });

  it("counts merged PRs (state === merged OR truthy merged_at)", () => {
    const prs: RawPR[] = [
      {
        number: 1,
        title: "PROJ-1 foo",
        repo_full_name: "org/repo",
        html_url: "",
        state: "merged",
        checks_status: null,
        author: "alice",
        created_at: "2026-06-30T08:00:00Z",
      },
      {
        number: 2,
        title: "PROJ-2 bar",
        repo_full_name: "org/repo",
        html_url: "",
        state: "closed",
        checks_status: null,
        author: "bob",
        created_at: "2026-06-29T08:00:00Z",
        merged_at: "2026-06-29T12:00:00Z",
      },
      {
        number: 3,
        title: "PROJ-3 baz",
        repo_full_name: "org/repo",
        html_url: "",
        state: "closed",
        checks_status: null,
        author: "charlie",
        created_at: "2026-06-28T08:00:00Z",
      },
    ];
    const result = computePrFlow(prs, [], now);
    expect(result.merged).toBe(2);
  });

  it("computes medianFirstReviewH from first_review_at - created_at", () => {
    const prs: RawPR[] = [
      // first_review_at 2h after created → 2 hours
      {
        number: 1,
        title: "PROJ-1 foo",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: null,
        author: "alice",
        created_at: "2026-07-01T10:00:00Z",
        first_review_at: "2026-07-01T12:00:00Z",
      },
      // first_review_at 4h after created → 4 hours
      {
        number: 2,
        title: "PROJ-2 bar",
        repo_full_name: "org/repo",
        html_url: "",
        state: "merged",
        checks_status: null,
        author: "bob",
        created_at: "2026-06-30T08:00:00Z",
        first_review_at: "2026-06-30T12:00:00Z",
      },
    ];
    const result = computePrFlow(prs, [], now);
    // median of [2, 4] = 3.0
    expect(result.medianFirstReviewH).toBe(3.0);
    expect(result.firstReviewSample).toBe(2);
  });

  it("returns null for medianFirstReviewH when no PRs have first_review_at", () => {
    const prs: RawPR[] = [
      {
        number: 1,
        title: "PROJ-1 foo",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: null,
        author: "alice",
        created_at: "2026-07-01T10:00:00Z",
      },
      {
        number: 2,
        title: "PROJ-2 bar",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: null,
        author: "bob",
        created_at: "2026-07-01T11:00:00Z",
      },
    ];
    const result = computePrFlow(prs, [], now);
    expect(result.medianFirstReviewH).toBeNull();
    expect(result.firstReviewSample).toBe(0);
  });

  it("computes avgAgeDays only from open PRs (now - created_at)", () => {
    const prs: RawPR[] = [
      // open, 1 day old
      {
        number: 1,
        title: "PROJ-1 foo",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: null,
        author: "alice",
        created_at: "2026-07-01T12:00:00Z",
      },
      // open, 2 days old
      {
        number: 2,
        title: "PROJ-2 bar",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: null,
        author: "bob",
        created_at: "2026-06-30T12:00:00Z",
      },
      // merged, 10 days old → ignored
      {
        number: 3,
        title: "PROJ-3 baz",
        repo_full_name: "org/repo",
        html_url: "",
        state: "merged",
        checks_status: null,
        author: "charlie",
        created_at: "2026-06-22T12:00:00Z",
      },
    ];
    const result = computePrFlow(prs, [], now);
    // (1 + 2) / 2 = 1.5
    expect(result.avgAgeDays).toBe(1.5);
  });

  it("returns 0 for avgAgeDays when no open PRs", () => {
    const prs: RawPR[] = [
      {
        number: 1,
        title: "PROJ-1 foo",
        repo_full_name: "org/repo",
        html_url: "",
        state: "merged",
        checks_status: null,
        author: "alice",
        created_at: "2026-06-30T08:00:00Z",
      },
    ];
    const result = computePrFlow(prs, [], now);
    expect(result.avgAgeDays).toBe(0);
  });

  it("counts failingChecks (open PRs with checks_status === FAILURE)", () => {
    const prs: RawPR[] = [
      {
        number: 1,
        title: "PROJ-1 foo",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: "FAILURE",
        author: "alice",
        created_at: "2026-07-01T10:00:00Z",
      },
      {
        number: 2,
        title: "PROJ-2 bar",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: "SUCCESS",
        author: "bob",
        created_at: "2026-07-01T11:00:00Z",
      },
      {
        number: 3,
        title: "PROJ-3 baz",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: "FAILURE",
        author: "charlie",
        created_at: "2026-07-01T12:00:00Z",
      },
      {
        number: 4,
        title: "PROJ-4 qux",
        repo_full_name: "org/repo",
        html_url: "",
        state: "merged",
        checks_status: "FAILURE",
        author: "dave",
        created_at: "2026-06-30T08:00:00Z",
      },
    ];
    const result = computePrFlow(prs, [], now);
    expect(result.failingChecks).toBe(2);
  });

  it("counts noJira (PRs with no extractable ticket key)", () => {
    const prs: RawPR[] = [
      {
        number: 1,
        title: "PROJ-1 foo",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: null,
        author: "alice",
        created_at: "2026-07-01T10:00:00Z",
      },
      {
        number: 2,
        title: "no ticket here",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: null,
        author: "bob",
        created_at: "2026-07-01T11:00:00Z",
      },
      {
        number: 3,
        title: "[PROJ-3] baz",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: null,
        author: "charlie",
        created_at: "2026-07-01T12:00:00Z",
      },
      {
        number: 4,
        title: "another no ticket",
        repo_full_name: "org/repo",
        html_url: "",
        state: "merged",
        checks_status: null,
        author: "dave",
        created_at: "2026-06-30T08:00:00Z",
      },
    ];
    const result = computePrFlow(prs, [], now);
    expect(result.noJira).toBe(2);
  });

  it("counts jiraNoPR (in-progress issues with no linked PRs)", () => {
    const issues: EnrichedIssue[] = [
      {
        key: "PROJ-1",
        summary: "foo",
        status: "In Progress",
        statusCategory: "indeterminate",
        assigneeAccountId: "123",
        assigneeName: "Alice",
        epicKey: null,
        epicName: null,
        linkedPRs: [],
        createdAt: null,
        updatedAt: null,
        dueDate: null,
        storyPoints: null,
        ageDays: 0,
        daysSinceUpdate: 0,
        flags: {
          unassigned: false,
          noEpic: false,
          stale: false,
          addedAfterStart: false,
          dueSoon: false,
          prFailingCI: false,
          prWaitingReview: false,
          inProgressNoPR: true,
        },
        risk: { score: 0, level: "normal", reasons: [] },
      },
      {
        key: "PROJ-2",
        summary: "bar",
        status: "In Progress",
        statusCategory: "indeterminate",
        assigneeAccountId: "456",
        assigneeName: "Bob",
        epicKey: null,
        epicName: null,
        linkedPRs: [
          {
            number: 1,
            title: "PROJ-2 bar",
            repo_full_name: "org/repo",
            html_url: "",
            state: "open",
            checks_status: null,
            author: "bob",
            createdAt: null,
            mergedAt: null,
            reviewState: null,
            waitingReview: false,
          },
        ],
        createdAt: null,
        updatedAt: null,
        dueDate: null,
        storyPoints: null,
        ageDays: 0,
        daysSinceUpdate: 0,
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
      },
      {
        key: "PROJ-3",
        summary: "baz",
        status: "To Do",
        statusCategory: "new",
        assigneeAccountId: null,
        assigneeName: null,
        epicKey: null,
        epicName: null,
        linkedPRs: [],
        createdAt: null,
        updatedAt: null,
        dueDate: null,
        storyPoints: null,
        ageDays: 0,
        daysSinceUpdate: 0,
        flags: {
          unassigned: true,
          noEpic: false,
          stale: false,
          addedAfterStart: false,
          dueSoon: false,
          prFailingCI: false,
          prWaitingReview: false,
          inProgressNoPR: false,
        },
        risk: { score: 0, level: "normal", reasons: [] },
      },
      {
        key: "PROJ-4",
        summary: "qux",
        status: "In Progress",
        statusCategory: "indeterminate",
        assigneeAccountId: "789",
        assigneeName: "Charlie",
        epicKey: null,
        epicName: null,
        linkedPRs: [],
        createdAt: null,
        updatedAt: null,
        dueDate: null,
        storyPoints: null,
        ageDays: 0,
        daysSinceUpdate: 0,
        flags: {
          unassigned: false,
          noEpic: false,
          stale: false,
          addedAfterStart: false,
          dueSoon: false,
          prFailingCI: false,
          prWaitingReview: false,
          inProgressNoPR: true,
        },
        risk: { score: 0, level: "normal", reasons: [] },
      },
    ];
    const result = computePrFlow([], issues, now);
    expect(result.jiraNoPR).toBe(2);
  });

  describe("first review", () => {
    const base: RawPR = {
      number: 1,
      title: "PROJ-1 foo",
      repo_full_name: "org/repo",
      html_url: "",
      state: "open",
      checks_status: null,
      author: "alice",
      created_at: "2026-07-01T00:00:00Z",
    };
    const reviewedAfter = (hours: number, extra: Partial<RawPR> = {}): RawPR => ({
      ...base,
      first_review_at: new Date(Date.parse(base.created_at) + hours * 3600_000).toISOString(),
      ...extra,
    });

    it("uses the median so one slow PR doesn't dominate", () => {
      const prs = [reviewedAfter(1), reviewedAfter(2), reviewedAfter(3), reviewedAfter(200)];
      const result = computePrFlow(prs, [], now);
      // median of [1, 2, 3, 200] = 2.5 (the mean would be 51.5)
      expect(result.medianFirstReviewH).toBe(2.5);
      expect(result.firstReviewSample).toBe(4);
    });

    it("measures from ready_at, not created_at, when the PR started as a draft", () => {
      const prs = [reviewedAfter(50, { ready_at: "2026-07-03T00:00:00Z" })];
      // ready 48h after creation, reviewed 2h later
      expect(computePrFlow(prs, [], now).medianFirstReviewH).toBe(2);
    });

    it("skips PRs that were never ready for review", () => {
      const prs = [reviewedAfter(5, { ready_at: null }), reviewedAfter(1)];
      const result = computePrFlow(prs, [], now);
      expect(result.medianFirstReviewH).toBe(1);
      expect(result.firstReviewSample).toBe(1);
    });

    it("counts a review left on the draft as 0h, not negative", () => {
      const prs = [reviewedAfter(1, { ready_at: "2026-07-01T05:00:00Z" })];
      expect(computePrFlow(prs, [], now).medianFirstReviewH).toBe(0);
    });
  });

  it("computes all metrics together", () => {
    const prs: RawPR[] = [
      {
        number: 1,
        title: "PROJ-1 foo",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: "FAILURE",
        author: "alice",
        created_at: "2026-07-01T10:00:00Z",
        first_review_at: "2026-07-01T12:00:00Z",
      },
      {
        number: 2,
        title: "no ticket",
        repo_full_name: "org/repo",
        html_url: "",
        state: "open",
        checks_status: null,
        author: "bob",
        created_at: "2026-07-01T08:00:00Z",
      },
      {
        number: 3,
        title: "PROJ-3 baz",
        repo_full_name: "org/repo",
        html_url: "",
        state: "merged",
        checks_status: null,
        author: "charlie",
        created_at: "2026-06-30T08:00:00Z",
        first_review_at: "2026-06-30T10:00:00Z",
        merged_at: "2026-06-30T12:00:00Z",
      },
    ];
    const issues: EnrichedIssue[] = [
      {
        key: "PROJ-10",
        summary: "in-progress no PR",
        status: "In Progress",
        statusCategory: "indeterminate",
        assigneeAccountId: "123",
        assigneeName: "Alice",
        epicKey: null,
        epicName: null,
        linkedPRs: [],
        createdAt: null,
        updatedAt: null,
        dueDate: null,
        storyPoints: null,
        ageDays: 0,
        daysSinceUpdate: 0,
        flags: {
          unassigned: false,
          noEpic: false,
          stale: false,
          addedAfterStart: false,
          dueSoon: false,
          prFailingCI: false,
          prWaitingReview: false,
          inProgressNoPR: true,
        },
        risk: { score: 0, level: "normal", reasons: [] },
      },
    ];

    const result = computePrFlow(prs, issues, now);

    expect(result.open).toBe(2);
    expect(result.merged).toBe(1);
    // medianFirstReviewH: median of [2, 2] = 2.0
    expect(result.medianFirstReviewH).toBe(2.0);
    // avgAgeDays (open only): PR#1 = 1d+2h = ~1.08d, PR#2 = 1d+4h = ~1.17d → mean ~1.1d
    // 2026-07-02T12:00 - 2026-07-01T10:00 = 26h = 1.08333... days
    // 2026-07-02T12:00 - 2026-07-01T08:00 = 28h = 1.16666... days
    // mean = (1.08333 + 1.16666) / 2 = 1.125 → rounds to 1.1
    expect(result.avgAgeDays).toBeCloseTo(1.1, 1);
    expect(result.failingChecks).toBe(1);
    expect(result.noJira).toBe(1);
    expect(result.jiraNoPR).toBe(1);
  });
});
