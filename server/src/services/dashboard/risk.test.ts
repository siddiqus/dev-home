/**
 * Tests for risk.ts — per-issue enrichment: age, flags, risk scoring.
 * TDD approach: define behavior before implementing.
 */
import { describe, it, expect } from "vitest";
import { enrichIssue, groupPRsByTicket } from "./risk";
import type { RawIssue, RawPR } from "../teamAggregation";
import type { SprintInfo } from "./types";
import { DEFAULT_COCKPIT_CONFIG } from "./config";

const NOW = new Date("2026-07-02T12:00:00Z");
const SPRINT: SprintInfo = {
  id: 1,
  startDate: "2026-06-25T00:00:00Z",
  endDate: "2026-07-09T00:00:00Z",
};

describe("groupPRsByTicket", () => {
  it("groups PRs by Jira key extracted from title", () => {
    const prs: RawPR[] = [
      {
        number: 1,
        title: "ABC-123 fix login",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/1",
        state: "open",
        checks_status: null,
        author: "alice",
        created_at: "2026-07-01T10:00:00Z",
      },
      {
        number: 2,
        title: "[ABC-123] another fix",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/2",
        state: "open",
        checks_status: null,
        author: "bob",
        created_at: "2026-07-01T11:00:00Z",
      },
      {
        number: 3,
        title: "ABC-456 different ticket",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/3",
        state: "open",
        checks_status: null,
        author: "charlie",
        created_at: "2026-07-01T12:00:00Z",
      },
    ];
    const grouped = groupPRsByTicket(prs);
    expect(grouped.get("ABC-123")).toHaveLength(2);
    expect(grouped.get("ABC-456")).toHaveLength(1);
    expect(grouped.get("NONEXISTENT")).toBeUndefined();
  });

  it("skips PRs with no Jira key", () => {
    const prs: RawPR[] = [
      {
        number: 1,
        title: "fix something",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/1",
        state: "open",
        checks_status: null,
        author: "alice",
        created_at: "2026-07-01T10:00:00Z",
      },
    ];
    const grouped = groupPRsByTicket(prs);
    expect(grouped.size).toBe(0);
  });
});

describe("enrichIssue", () => {
  it("computes ageDays from createdAt to now", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: "ABC-100",
      epicName: "Epic",
      createdAt: "2026-06-30T12:00:00Z", // 2 days ago
      updatedAt: "2026-07-02T12:00:00Z",
    };
    const enriched = enrichIssue(issue, [], SPRINT, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.ageDays).toBe(2);
  });

  it("returns 0 ageDays when createdAt is missing", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "To Do",
      statusCategory: "new",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
      createdAt: null,
      updatedAt: null,
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.ageDays).toBe(0);
  });

  it("computes daysSinceUpdate from updatedAt to now", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
      createdAt: "2026-06-30T12:00:00Z",
      updatedAt: "2026-06-29T12:00:00Z", // 3 days ago
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.daysSinceUpdate).toBe(3);
  });

  it("flags unassigned when assigneeAccountId is null", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "To Do",
      statusCategory: "new",
      assigneeAccountId: null,
      assigneeName: null,
      epicKey: "ABC-100",
      epicName: "Epic",
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.unassigned).toBe(true);
  });

  it("flags noEpic when epicKey is null", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "To Do",
      statusCategory: "new",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.noEpic).toBe(true);
  });

  it("flags stale when statusCategory=indeterminate and daysSinceUpdate > staleDays", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: "ABC-100",
      epicName: "Epic",
      updatedAt: "2026-06-29T12:00:00Z", // 3 days ago, > 2 (staleDays)
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.stale).toBe(true);
    expect(enriched.daysSinceUpdate).toBe(3);
  });

  it("does not flag stale when statusCategory is not indeterminate", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "Done",
      statusCategory: "done",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
      updatedAt: "2026-06-01T12:00:00Z", // 31 days ago
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.stale).toBe(false);
  });

  it("flags addedAfterStart when createdAt > sprint.startDate", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "To Do",
      statusCategory: "new",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
      createdAt: "2026-06-26T00:00:01Z", // after sprint start
    };
    const enriched = enrichIssue(issue, [], SPRINT, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.addedAfterStart).toBe(true);
  });

  it("does not flag addedAfterStart when createdAt <= sprint.startDate", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "To Do",
      statusCategory: "new",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
      createdAt: "2026-06-24T23:59:59Z", // before sprint start
    };
    const enriched = enrichIssue(issue, [], SPRINT, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.addedAfterStart).toBe(false);
  });

  it("does not flag addedAfterStart when sprint is null", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "To Do",
      statusCategory: "new",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
      createdAt: "2026-06-26T00:00:01Z",
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.addedAfterStart).toBe(false);
  });

  it("flags dueSoon when dueDate is within dueSoonDays", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
      dueDate: "2026-07-03T00:00:00Z", // 0.5 days away, < 2 days
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.dueSoon).toBe(true);
  });

  it("flags dueSoon when dueDate is overdue", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
      dueDate: "2026-07-01T00:00:00Z", // yesterday, overdue
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.dueSoon).toBe(true);
  });

  it("does not flag dueSoon when dueDate is far in future", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
      dueDate: "2026-07-10T00:00:00Z", // 8 days away, > 2 days
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.dueSoon).toBe(false);
  });

  it("flags prFailingCI when any linked PR has checks_status=FAILURE", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
    };
    const prs: RawPR[] = [
      {
        number: 1,
        title: "ABC-123 fix",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/1",
        state: "open",
        checks_status: "FAILURE",
        author: "alice",
        created_at: "2026-07-01T10:00:00Z",
      },
    ];
    const enriched = enrichIssue(issue, prs, null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.prFailingCI).toBe(true);
  });

  it("flags prWaitingReview when PR is open with no first_review_at and hours > waitingReviewHours", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
    };
    const prs: RawPR[] = [
      {
        number: 1,
        title: "ABC-123 fix",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/1",
        state: "open",
        checks_status: null,
        author: "alice",
        created_at: "2026-07-01T11:00:00Z", // 25 hours ago, > 24h
        first_review_at: null,
      },
    ];
    const enriched = enrichIssue(issue, prs, null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.prWaitingReview).toBe(true);
    expect(enriched.linkedPRs[0].waitingReview).toBe(true);
  });

  it("does not flag prWaitingReview when PR has first_review_at", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
    };
    const prs: RawPR[] = [
      {
        number: 1,
        title: "ABC-123 fix",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/1",
        state: "open",
        checks_status: null,
        author: "alice",
        created_at: "2026-07-01T11:00:00Z", // 25 hours ago
        first_review_at: "2026-07-01T12:00:00Z",
      },
    ];
    const enriched = enrichIssue(issue, prs, null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.prWaitingReview).toBe(false);
    expect(enriched.linkedPRs[0].waitingReview).toBe(false);
  });

  it("does not flag prWaitingReview when PR is within waitingReviewHours threshold", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
    };
    const prs: RawPR[] = [
      {
        number: 1,
        title: "ABC-123 fix",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/1",
        state: "open",
        checks_status: null,
        author: "alice",
        created_at: "2026-07-02T11:00:00Z", // 1 hour ago, < 24h
        first_review_at: null,
      },
    ];
    const enriched = enrichIssue(issue, prs, null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.prWaitingReview).toBe(false);
    expect(enriched.linkedPRs[0].waitingReview).toBe(false);
  });

  it("does not flag prWaitingReview when PR state is not open", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
    };
    const prs: RawPR[] = [
      {
        number: 1,
        title: "ABC-123 fix",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/1",
        state: "closed",
        checks_status: null,
        author: "alice",
        created_at: "2026-07-01T11:00:00Z", // 25 hours ago
        first_review_at: null,
      },
    ];
    const enriched = enrichIssue(issue, prs, null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.prWaitingReview).toBe(false);
    expect(enriched.linkedPRs[0].waitingReview).toBe(false);
  });

  it("flags inProgressNoPR when statusCategory=indeterminate and no linked PRs", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.inProgressNoPR).toBe(true);
  });

  it("does not flag inProgressNoPR when statusCategory is not indeterminate", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "To Do",
      statusCategory: "new",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.inProgressNoPR).toBe(false);
  });

  it("computes risk score from multiple flags", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: null, // +1 unassigned
      assigneeName: null,
      epicKey: null, // +1 noEpic
      epicName: null,
      updatedAt: "2026-06-29T12:00:00Z", // 3 days ago -> stale +3
    };
    // stale (3) + unassigned (1) + noEpic (1) + inProgressNoPR (1) = 6 -> high
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.risk.score).toBe(6);
    expect(enriched.risk.level).toBe("high");
    expect(enriched.risk.reasons).toContain("stale");
    expect(enriched.risk.reasons).toContain("unassigned");
    expect(enriched.risk.reasons).toContain("noEpic");
    expect(enriched.risk.reasons).toContain("inProgressNoPR");
  });

  it("returns score 0 for a clean done issue", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "Done",
      statusCategory: "done",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: "ABC-100",
      epicName: "Epic",
      updatedAt: "2026-07-02T12:00:00Z",
    };
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.risk.score).toBe(0);
    expect(enriched.risk.level).toBe("normal");
    expect(enriched.risk.reasons).toEqual([]);
  });

  it("computes high-risk stale issue with failing CI and waiting review", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: "ABC-100",
      epicName: "Epic",
      updatedAt: "2026-06-29T12:00:00Z", // 3 days ago -> stale +3
    };
    const prs: RawPR[] = [
      {
        number: 1,
        title: "ABC-123 fix",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/1",
        state: "open",
        checks_status: "FAILURE", // +2
        author: "alice",
        created_at: "2026-07-01T10:00:00Z", // 26 hours ago -> waiting review +2
        first_review_at: null,
      },
    ];
    // stale (3) + prFailingCI (2) + prWaitingReview (2) = 7 -> high
    const enriched = enrichIssue(issue, prs, null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.risk.score).toBe(7);
    expect(enriched.risk.level).toBe("high");
    expect(enriched.risk.reasons).toContain("stale");
    expect(enriched.risk.reasons).toContain("prFailingCI");
    expect(enriched.risk.reasons).toContain("prWaitingReview");
  });

  it("assigns attention level for score 3-4", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: null, // +1
      assigneeName: null,
      epicKey: null, // +1
      epicName: null,
      dueDate: "2026-07-03T00:00:00Z", // +1
    };
    // unassigned (1) + noEpic (1) + dueSoon (1) + inProgressNoPR (1) = 4 -> attention
    const enriched = enrichIssue(issue, [], null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.risk.score).toBe(4);
    expect(enriched.risk.level).toBe("attention");
  });

  it("includes human-readable reasons for each flag", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: "ABC-100",
      epicName: "Epic",
      createdAt: "2026-06-26T00:00:01Z", // after sprint start +1
    };
    const enriched = enrichIssue(issue, [], SPRINT, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.addedAfterStart).toBe(true);
    expect(enriched.flags.inProgressNoPR).toBe(true);
    expect(enriched.risk.score).toBe(2);
    expect(enriched.risk.reasons).toContain("addedAfterStart");
    expect(enriched.risk.reasons).toContain("inProgressNoPR");
  });

  it("handles multiple PRs with mixed states", () => {
    const issue: RawIssue = {
      key: "ABC-123",
      summary: "test",
      status: "In Progress",
      statusCategory: "indeterminate",
      assigneeAccountId: "user1",
      assigneeName: "Alice",
      epicKey: null,
      epicName: null,
    };
    const prs: RawPR[] = [
      {
        number: 1,
        title: "ABC-123 fix",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/1",
        state: "open",
        checks_status: "SUCCESS",
        author: "alice",
        created_at: "2026-07-02T11:00:00Z", // 1 hour ago, not waiting
        first_review_at: null,
      },
      {
        number: 2,
        title: "ABC-123 another",
        repo_full_name: "org/repo",
        html_url: "https://github.com/org/repo/pull/2",
        state: "open",
        checks_status: "FAILURE",
        author: "alice",
        created_at: "2026-07-01T11:00:00Z", // 25 hours ago, waiting
        first_review_at: null,
      },
    ];
    const enriched = enrichIssue(issue, prs, null, NOW, DEFAULT_COCKPIT_CONFIG);
    expect(enriched.flags.prFailingCI).toBe(true);
    expect(enriched.flags.prWaitingReview).toBe(true);
    expect(enriched.linkedPRs[0].waitingReview).toBe(false);
    expect(enriched.linkedPRs[1].waitingReview).toBe(true);
  });
});
