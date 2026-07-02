/**
 * Tests for attention.ts — Needs-Attention panel aggregation.
 * TDD approach: define behavior before implementing.
 */
import { describe, it, expect } from "vitest";
import { buildNeedsAttention } from "./attention";
import type { EnrichedIssue, LinkedPR } from "./types";

function makeIssue(
  key: string,
  flags: Partial<EnrichedIssue["flags"]>,
  linkedPRs: LinkedPR[] = [],
): EnrichedIssue {
  return {
    key,
    summary: "test",
    status: "In Progress",
    statusCategory: "indeterminate",
    assigneeAccountId: "user1",
    assigneeName: "Alice",
    epicKey: "ABC-100",
    epicName: "Epic",
    linkedPRs,
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
      ...flags,
    },
    risk: { score: 0, level: "normal", reasons: [] },
  };
}

function makePR(
  number: number,
  repo: string,
  overrides: Partial<LinkedPR> = {},
): LinkedPR {
  return {
    number,
    title: "test PR",
    repo_full_name: repo,
    html_url: `https://github.com/${repo}/pull/${number}`,
    state: "open",
    checks_status: null,
    author: "alice",
    createdAt: "2026-07-01T10:00:00Z",
    mergedAt: null,
    reviewState: null,
    waitingReview: false,
    ...overrides,
  };
}

describe("buildNeedsAttention", () => {
  it("populates stale bucket from issues with flags.stale", () => {
    const issues = [
      makeIssue("ABC-123", { stale: true }),
      makeIssue("ABC-124", { stale: false }),
      makeIssue("ABC-125", { stale: true }),
    ];
    const result = buildNeedsAttention(issues, []);
    expect(result.stale).toEqual([
      { kind: "issue", key: "ABC-123" },
      { kind: "issue", key: "ABC-125" },
    ]);
  });

  it("populates waitingReview bucket from PRs with waitingReview=true", () => {
    const issues = [
      makeIssue("ABC-123", {}, [makePR(1, "org/repo", { waitingReview: true })]),
      makeIssue("ABC-124", {}, [makePR(2, "org/repo", { waitingReview: false })]),
      makeIssue("ABC-125", {}, [
        makePR(3, "org/other", { waitingReview: true }),
        makePR(4, "org/other", { waitingReview: true }),
      ]),
    ];
    const result = buildNeedsAttention(issues, []);
    expect(result.waitingReview).toEqual([
      { kind: "pr", repo: "org/repo", number: 1 },
      { kind: "pr", repo: "org/other", number: 3 },
      { kind: "pr", repo: "org/other", number: 4 },
    ]);
  });

  it("deduplicates PRs in waitingReview bucket by repo+number", () => {
    const issues = [
      makeIssue("ABC-123", {}, [makePR(1, "org/repo", { waitingReview: true })]),
      makeIssue("ABC-124", {}, [makePR(1, "org/repo", { waitingReview: true })]), // duplicate
      makeIssue("ABC-125", {}, [makePR(2, "org/repo", { waitingReview: true })]),
    ];
    const result = buildNeedsAttention(issues, []);
    expect(result.waitingReview).toEqual([
      { kind: "pr", repo: "org/repo", number: 1 },
      { kind: "pr", repo: "org/repo", number: 2 },
    ]);
  });

  it("populates failingCI bucket from PRs with checks_status=FAILURE", () => {
    const issues = [
      makeIssue("ABC-123", {}, [makePR(1, "org/repo", { checks_status: "FAILURE" })]),
      makeIssue("ABC-124", {}, [makePR(2, "org/repo", { checks_status: "SUCCESS" })]),
      makeIssue("ABC-125", {}, [makePR(3, "org/other", { checks_status: "FAILURE" })]),
    ];
    const result = buildNeedsAttention(issues, []);
    expect(result.failingCI).toEqual([
      { kind: "pr", repo: "org/repo", number: 1 },
      { kind: "pr", repo: "org/other", number: 3 },
    ]);
  });

  it("deduplicates PRs in failingCI bucket by repo+number", () => {
    const issues = [
      makeIssue("ABC-123", {}, [
        makePR(1, "org/repo", { checks_status: "FAILURE" }),
        makePR(2, "org/repo", { checks_status: "FAILURE" }),
      ]),
      makeIssue("ABC-124", {}, [makePR(1, "org/repo", { checks_status: "FAILURE" })]), // duplicate
    ];
    const result = buildNeedsAttention(issues, []);
    expect(result.failingCI).toEqual([
      { kind: "pr", repo: "org/repo", number: 1 },
      { kind: "pr", repo: "org/repo", number: 2 },
    ]);
  });

  it("populates noLinkedPR bucket from issues with flags.inProgressNoPR", () => {
    const issues = [
      makeIssue("ABC-123", { inProgressNoPR: true }),
      makeIssue("ABC-124", { inProgressNoPR: false }),
      makeIssue("ABC-125", { inProgressNoPR: true }),
    ];
    const result = buildNeedsAttention(issues, []);
    expect(result.noLinkedPR).toEqual([
      { kind: "issue", key: "ABC-123" },
      { kind: "issue", key: "ABC-125" },
    ]);
  });

  it("populates offBoard bucket from offBoardPRs argument", () => {
    const offBoardPRs = [
      { repo_full_name: "org/repo", number: 1 },
      { repo_full_name: "org/other", number: 2 },
    ];
    const result = buildNeedsAttention([], offBoardPRs);
    expect(result.offBoard).toEqual([
      { kind: "pr", repo: "org/repo", number: 1 },
      { kind: "pr", repo: "org/other", number: 2 },
    ]);
  });

  it("populates scopeCreep bucket from issues with flags.addedAfterStart", () => {
    const issues = [
      makeIssue("ABC-123", { addedAfterStart: true }),
      makeIssue("ABC-124", { addedAfterStart: false }),
      makeIssue("ABC-125", { addedAfterStart: true }),
    ];
    const result = buildNeedsAttention(issues, []);
    expect(result.scopeCreep).toEqual([
      { kind: "issue", key: "ABC-123" },
      { kind: "issue", key: "ABC-125" },
    ]);
  });

  it("populates unassigned bucket from issues with flags.unassigned", () => {
    const issues = [
      makeIssue("ABC-123", { unassigned: true }),
      makeIssue("ABC-124", { unassigned: false }),
      makeIssue("ABC-125", { unassigned: true }),
    ];
    const result = buildNeedsAttention(issues, []);
    expect(result.unassigned).toEqual([
      { kind: "issue", key: "ABC-123" },
      { kind: "issue", key: "ABC-125" },
    ]);
  });

  it("populates noEpic bucket from issues with flags.noEpic", () => {
    const issues = [
      makeIssue("ABC-123", { noEpic: true }),
      makeIssue("ABC-124", { noEpic: false }),
      makeIssue("ABC-125", { noEpic: true }),
    ];
    const result = buildNeedsAttention(issues, []);
    expect(result.noEpic).toEqual([
      { kind: "issue", key: "ABC-123" },
      { kind: "issue", key: "ABC-125" },
    ]);
  });

  it("handles multiple buckets simultaneously", () => {
    const issues = [
      makeIssue("ABC-123", { stale: true, unassigned: true }, [
        makePR(1, "org/repo", { waitingReview: true, checks_status: "FAILURE" }),
      ]),
      makeIssue("ABC-124", { noEpic: true, addedAfterStart: true }),
      makeIssue("ABC-125", { inProgressNoPR: true }),
    ];
    const offBoardPRs = [{ repo_full_name: "org/other", number: 99 }];
    const result = buildNeedsAttention(issues, offBoardPRs);

    expect(result.stale).toEqual([{ kind: "issue", key: "ABC-123" }]);
    expect(result.waitingReview).toEqual([{ kind: "pr", repo: "org/repo", number: 1 }]);
    expect(result.failingCI).toEqual([{ kind: "pr", repo: "org/repo", number: 1 }]);
    expect(result.noLinkedPR).toEqual([{ kind: "issue", key: "ABC-125" }]);
    expect(result.offBoard).toEqual([{ kind: "pr", repo: "org/other", number: 99 }]);
    expect(result.scopeCreep).toEqual([{ kind: "issue", key: "ABC-124" }]);
    expect(result.unassigned).toEqual([{ kind: "issue", key: "ABC-123" }]);
    expect(result.noEpic).toEqual([{ kind: "issue", key: "ABC-124" }]);
  });

  it("returns empty buckets when no issues match", () => {
    const issues = [makeIssue("ABC-123", {})];
    const result = buildNeedsAttention(issues, []);

    expect(result.stale).toEqual([]);
    expect(result.waitingReview).toEqual([]);
    expect(result.failingCI).toEqual([]);
    expect(result.noLinkedPR).toEqual([]);
    expect(result.offBoard).toEqual([]);
    expect(result.scopeCreep).toEqual([]);
    expect(result.unassigned).toEqual([]);
    expect(result.noEpic).toEqual([]);
  });

  it("handles empty inputs gracefully", () => {
    const result = buildNeedsAttention([], []);

    expect(result.stale).toEqual([]);
    expect(result.waitingReview).toEqual([]);
    expect(result.failingCI).toEqual([]);
    expect(result.noLinkedPR).toEqual([]);
    expect(result.offBoard).toEqual([]);
    expect(result.scopeCreep).toEqual([]);
    expect(result.unassigned).toEqual([]);
    expect(result.noEpic).toEqual([]);
  });
});
