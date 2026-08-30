import { describe, it, expect } from "vitest";
import {
  categorizeOpenPR,
  groupPRsBySection,
  OPEN_PR_SECTIONS,
  ACTIONABLE_REASONS,
} from "./prCategories";
import type { GitHubPR } from "../types";

function makePR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 1,
    title: "Test PR",
    html_url: "https://github.com/o/r/pull/1",
    state: "open",
    draft: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    user: { login: "octocat", avatar_url: "" },
    head: { ref: "feature" },
    base: { ref: "main" },
    body: "",
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    in_merge_queue: false,
    ...overrides,
  };
}

describe("categorizeOpenPR", () => {
  it("puts any draft into 'draft', regardless of checks/reviews", () => {
    expect(categorizeOpenPR(makePR({ draft: true }))).toBe("draft");
    expect(
      categorizeOpenPR(
        makePR({ draft: true, review_status: "APPROVED", checks_status: "SUCCESS" }),
      ),
    ).toBe("draft");
    expect(categorizeOpenPR(makePR({ draft: true, checks_status: "FAILURE" }))).toBe("draft");
  });

  it("puts approved PRs with red CI into 'needs-action' (needs-action wins)", () => {
    expect(categorizeOpenPR(makePR({ review_status: "APPROVED", checks_status: "FAILURE" }))).toBe(
      "needs-action",
    );
  });

  it("puts approved PRs with green/pending CI into 'ready'", () => {
    expect(categorizeOpenPR(makePR({ review_status: "APPROVED", checks_status: "SUCCESS" }))).toBe(
      "ready",
    );
    expect(categorizeOpenPR(makePR({ review_status: "APPROVED", checks_status: "PENDING" }))).toBe(
      "ready",
    );
  });

  it("puts PRs in the merge queue into 'ready'", () => {
    expect(categorizeOpenPR(makePR({ in_merge_queue: true }))).toBe("ready");
  });

  it("treats every red check status as 'needs-action'", () => {
    for (const status of ["FAILURE", "ERROR", "STARTUP_FAILURE", "TIMED_OUT"]) {
      expect(categorizeOpenPR(makePR({ checks_status: status }))).toBe("needs-action");
    }
  });

  it("treats changes-requested and comment-only reviews as 'needs-action'", () => {
    expect(categorizeOpenPR(makePR({ review_status: "CHANGES_REQUESTED" }))).toBe("needs-action");
    expect(categorizeOpenPR(makePR({ review_status: "REVIEWED", checks_status: "SUCCESS" }))).toBe(
      "needs-action",
    );
  });

  it("puts green PRs with no reviews into 'pending'", () => {
    expect(categorizeOpenPR(makePR({ checks_status: "SUCCESS", review_status: null }))).toBe(
      "pending",
    );
  });

  it("puts pending-CI and no-check PRs with no reviews into 'pending' (catch-all)", () => {
    expect(categorizeOpenPR(makePR({ checks_status: "PENDING", review_status: null }))).toBe(
      "pending",
    );
    expect(categorizeOpenPR(makePR({ checks_status: "IN_PROGRESS", review_status: null }))).toBe(
      "pending",
    );
    expect(categorizeOpenPR(makePR({ checks_status: null, review_status: null }))).toBe("pending");
    expect(categorizeOpenPR(makePR({ checks_status: "NEUTRAL", review_status: null }))).toBe(
      "pending",
    );
  });
});

describe("groupPRsBySection", () => {
  it("returns every section key even when empty, preserving PR order within a bucket", () => {
    const ready = makePR({ id: 10, review_status: "APPROVED", checks_status: "SUCCESS" });
    const needs = makePR({ id: 20, checks_status: "FAILURE" });
    const pending1 = makePR({ id: 30, checks_status: "SUCCESS" });
    const pending2 = makePR({ id: 31, checks_status: null });

    const grouped = groupPRsBySection([ready, needs, pending1, pending2]);

    expect(grouped.ready.map((p) => p.id)).toEqual([10]);
    expect(grouped["needs-action"].map((p) => p.id)).toEqual([20]);
    expect(grouped.pending.map((p) => p.id)).toEqual([30, 31]);
    expect(grouped.draft).toEqual([]);
  });
});

describe("ACTIONABLE_REASONS", () => {
  const reason = (key: string) => {
    const found = ACTIONABLE_REASONS.find((r) => r.key === key);
    if (!found) throw new Error(`no actionable reason "${key}"`);
    return found;
  };

  it("declares the reasons most-blocking first (drives chip + filter order)", () => {
    expect(ACTIONABLE_REASONS.map((r) => r.key)).toEqual([
      "ci_failed",
      "conflict",
      "changes_requested",
      "reviewed",
      "your_turn",
      "unresolved",
    ]);
  });

  it("ci_failed matches only red check-rollup statuses", () => {
    for (const status of ["FAILURE", "ERROR", "STARTUP_FAILURE", "TIMED_OUT"]) {
      expect(reason("ci_failed").matches(makePR({ checks_status: status }))).toBe(true);
    }
    expect(reason("ci_failed").matches(makePR({ checks_status: "SUCCESS" }))).toBe(false);
    expect(reason("ci_failed").matches(makePR({ checks_status: null }))).toBe(false);
  });

  it("conflict matches only when the PR has a merge conflict", () => {
    expect(reason("conflict").matches(makePR({ has_conflict: true }))).toBe(true);
    expect(reason("conflict").matches(makePR({ has_conflict: false }))).toBe(false);
    expect(reason("conflict").matches(makePR())).toBe(false);
  });

  it("changes_requested and reviewed match their review statuses exclusively", () => {
    expect(
      reason("changes_requested").matches(makePR({ review_status: "CHANGES_REQUESTED" })),
    ).toBe(true);
    expect(reason("changes_requested").matches(makePR({ review_status: "REVIEWED" }))).toBe(false);
    expect(reason("reviewed").matches(makePR({ review_status: "REVIEWED" }))).toBe(true);
    expect(reason("reviewed").matches(makePR({ review_status: "CHANGES_REQUESTED" }))).toBe(false);
  });

  it("your_turn matches when it is the viewer's turn", () => {
    expect(reason("your_turn").matches(makePR({ your_turn: true }))).toBe(true);
    expect(reason("your_turn").matches(makePR({ your_turn: false }))).toBe(false);
    expect(reason("your_turn").matches(makePR())).toBe(false);
  });

  it("unresolved matches only a positive thread count", () => {
    expect(reason("unresolved").matches(makePR({ unresolved_thread_count: 3 }))).toBe(true);
    expect(reason("unresolved").matches(makePR({ unresolved_thread_count: 0 }))).toBe(false);
    expect(reason("unresolved").matches(makePR())).toBe(false);
  });
});

describe("OPEN_PR_SECTIONS", () => {
  it("declares the four sections in display order", () => {
    expect(OPEN_PR_SECTIONS.map((s) => s.id)).toEqual([
      "ready",
      "needs-action",
      "pending",
      "draft",
    ]);
  });
});
