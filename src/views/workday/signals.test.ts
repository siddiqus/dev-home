import { describe, it, expect } from "vitest";
import type { GitHubPR } from "../../types";
import {
  mySignals,
  reviewSignals,
  prPriority,
  visibleChips,
  headline,
  MAX_CHIPS,
  PRIORITY,
} from "./signals";

/** Test PR factory with defaults. */
const pr = (overrides: Partial<GitHubPR> = {}): GitHubPR => ({
  id: 1,
  number: 1203,
  title: "Test PR",
  html_url: "https://github.com/org/repo/pull/1203",
  state: "open",
  draft: false,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-14T10:00:00Z",
  user: { login: "author", avatar_url: "" },
  head: { ref: "feature" },
  base: { ref: "main" },
  repo_full_name: "org/repo",
  checks_status: null,
  checks: [],
  review_status: null,
  has_conflict: false,
  unresolved_thread_count: 0,
  requested_reviewers: [],
  ...overrides,
});

describe("mySignals", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  it("returns CI failing signal with check names", () => {
    const signals = mySignals(
      pr({
        checks_status: "FAILURE",
        checks: [
          { name: "lint", status: "FAILURE", url: null },
          { name: "unit", status: "FAILURE", url: null },
        ],
      }),
      now,
    );
    expect(signals[0]).toEqual({ label: "✗ Fix CI: lint + unit", tone: "danger" });
  });

  it("returns conflict signal", () => {
    const signals = mySignals(pr({ has_conflict: true }), now);
    expect(signals[0]).toEqual({ label: "✗ Resolve conflict with main", tone: "danger" });
  });

  it("returns changes requested with thread count", () => {
    const signals = mySignals(
      pr({ review_status: "CHANGES_REQUESTED", unresolved_thread_count: 3 }),
      now,
    );
    expect(signals).toEqual([
      { label: "✗ Address requested changes · 3 open threads", tone: "danger" },
    ]);
  });

  it("returns open threads warning when not changes requested", () => {
    const signals = mySignals(pr({ review_status: "APPROVED", unresolved_thread_count: 2 }), now);
    expect(signals).toContainEqual({ label: "2 open threads", tone: "warning" });
  });

  it("returns no reviewer signal for non-draft PR", () => {
    const signals = mySignals(pr({ requested_reviewers: [], review_status: null }), now);
    expect(signals[0]).toEqual({ label: "Request a review", tone: "warning" });
  });

  it("does not return no reviewer for draft PR", () => {
    const signals = mySignals(
      pr({ draft: true, requested_reviewers: [], review_status: null }),
      now,
    );
    const noReviewerSignal = signals.find((s) => s.label === "Request a review");
    expect(noReviewerSignal).toBeUndefined();
  });

  it("returns ready to merge signal", () => {
    const signals = mySignals(
      pr({
        review_status: "APPROVED",
        checks_status: "SUCCESS",
        has_conflict: false,
        in_merge_queue: false,
      }),
      now,
    );
    expect(signals).toContainEqual({ label: "✓ Ready to merge", tone: "success" });
  });

  it("returns approved signal when not ready to merge", () => {
    const signals = mySignals(
      pr({
        review_status: "APPROVED",
        checks_status: null,
      }),
      now,
    );
    const approvedSignal = signals.find((s) => s.label.startsWith("✓ Approved"));
    expect(approvedSignal).toBeDefined();
    expect(approvedSignal?.tone).toBe("success");
  });

  it("returns in merge queue signal", () => {
    const signals = mySignals(pr({ in_merge_queue: true }), now);
    expect(signals).toContainEqual({ label: "In merge queue", tone: "purple" });
  });

  it("returns waiting on reviewers signal with age", () => {
    const signals = mySignals(
      pr({
        requested_reviewers: ["alice", "bob"],
        review_status: null,
        created_at: "2026-10-13T12:00:00Z",
      }),
      now,
    );
    const waitingSignal = signals.find((s) => s.label.startsWith("⏳ Waiting on"));
    expect(waitingSignal).toBeDefined();
    expect(waitingSignal?.tone).toBe("neutral");
    expect(waitingSignal?.label).toContain("alice, bob");
  });

  it("returns draft signal", () => {
    const signals = mySignals(pr({ draft: true }), now);
    expect(signals[0]).toEqual({ label: "Draft · mark ready for review", tone: "neutral" });
  });

  it("asks for a response to a comment-only review that is my turn", () => {
    // e.g. a reviewer commented, their request cleared, nobody else is requested.
    const signals = mySignals(
      pr({ review_status: "REVIEWED", your_turn: true, unresolved_thread_count: 2 }),
      now,
    );
    expect(signals).toEqual([{ label: "Respond to feedback · 2 open threads", tone: "warning" }]);
  });

  it("asks for a re-request once I've answered a comment-only review", () => {
    const signals = mySignals(pr({ review_status: "REVIEWED", your_turn: false }), now);
    expect(signals[0]).toEqual({ label: "Re-request review", tone: "warning" });
  });

  it("keeps waiting on reviewers even with open threads", () => {
    const signals = mySignals(
      pr({
        requested_reviewers: ["alice"],
        unresolved_thread_count: 1,
        created_at: "2026-10-13T12:00:00Z",
      }),
      now,
    );
    expect(signals).toEqual([
      { label: "⏳ Waiting on alice · 1d", tone: "neutral" },
      { label: "1 open thread", tone: "warning" },
    ]);
  });

  it("flags failing non-required checks alongside the action", () => {
    const signals = mySignals(
      pr({ checks_status: "SUCCESS", optional_checks_failing: ["integration-test"] }),
      now,
    );
    expect(signals).toEqual([
      { label: "Request a review", tone: "warning" },
      {
        label: "⚠ integration-test failing (not required)",
        tone: "warning",
        detail: "integration-test",
      },
    ]);
  });

  it("never returns an empty list", () => {
    expect(mySignals(pr({ requested_reviewers: undefined }), now)).toEqual([
      { label: "⏳ Waiting for review · 13d", tone: "neutral" },
    ]);
  });

  it("shows no CI chip unless CI is failing", () => {
    for (const checks_status of ["SUCCESS", "PENDING"] as const) {
      const signals = mySignals(pr({ checks_status }), now);
      expect(signals.find((s) => s.label.includes("CI"))).toBeUndefined();
    }
  });

  it("orders signals by priority (danger > warning > info > success > purple > neutral)", () => {
    const signals = mySignals(
      pr({
        checks_status: "FAILURE",
        checks: [{ name: "lint", status: "FAILURE", url: null }],
        has_conflict: true,
        review_status: "CHANGES_REQUESTED",
        unresolved_thread_count: 2,
      }),
      now,
    );
    // First should be danger tone
    expect(signals[0].tone).toBe("danger");
  });
});

describe("reviewSignals", () => {
  it("returns re-requested signal when viewer engaged", () => {
    const signals = reviewSignals(
      pr({ viewer_engaged: true, user: { login: "alice", avatar_url: "" } }),
      true,
    );
    expect(signals).toEqual([{ label: "Re-review requested by alice", tone: "warning" }]);
  });

  it("returns new commits signal when non-approving review", () => {
    const signals = reviewSignals(
      pr({ new_commits_since_review: true, viewer_review_state: "COMMENTED" }),
      false,
    );
    expect(signals).toContainEqual({ label: "New commits since your review", tone: "warning" });
  });

  it("does not return new commits when review is approved", () => {
    const signals = reviewSignals(
      pr({ new_commits_since_review: true, viewer_review_state: "APPROVED" }),
      false,
    );
    const newCommitsSignal = signals.find((s) => s.label === "New commits since your review");
    expect(newCommitsSignal).toBeUndefined();
  });

  it("returns review requested signal with diff size", () => {
    const signals = reviewSignals(pr({ additions: 150, deletions: 50 }), true);
    const requestedSignal = signals.find((s) => s.label.startsWith("Review requested"));
    expect(requestedSignal).toBeDefined();
    expect(requestedSignal?.tone).toBe("info");
    expect(requestedSignal?.label).toContain("+150 −50");
  });

  it("says a draft needs no review yet instead of review signals", () => {
    const signals = reviewSignals(pr({ draft: true, viewer_engaged: true }), true);
    expect(signals).toEqual([{ label: "Draft · no review yet", tone: "neutral" }]);
  });

  it("is never blank: approved → nothing to do, otherwise waiting on the author", () => {
    expect(reviewSignals(pr({ viewer_review_state: "APPROVED" }), false)).toEqual([
      { label: "You approved · nothing to do", tone: "success" },
    ]);
    expect(reviewSignals(pr({ viewer_review_state: "COMMENTED" }), false)).toEqual([
      { label: "Waiting on author", tone: "neutral" },
    ]);
  });
});

describe("prPriority", () => {
  it("returns priority of worst signal", () => {
    const dangerSignal = { label: "Test", tone: "danger" as const };
    const warningSignal = { label: "Test", tone: "warning" as const };
    expect(prPriority([dangerSignal, warningSignal])).toBe(PRIORITY.danger);
  });

  it("returns neutral priority when no signals", () => {
    expect(prPriority([])).toBe(PRIORITY.neutral);
  });
});

describe("visibleChips", () => {
  it("shows all signals when under max", () => {
    const signals = [
      { label: "A", tone: "danger" as const },
      { label: "B", tone: "warning" as const },
    ];
    const result = visibleChips(signals);
    expect(result.shown).toEqual(signals);
    expect(result.more).toEqual([]);
  });

  it("cuts at MAX_CHIPS and returns overflow", () => {
    const signals = [
      { label: "A", tone: "danger" as const },
      { label: "B", tone: "warning" as const },
      { label: "C", tone: "info" as const },
      { label: "D", tone: "success" as const },
      { label: "E", tone: "purple" as const },
      { label: "F", tone: "neutral" as const },
    ];
    const result = visibleChips(signals);
    expect(result.shown).toHaveLength(MAX_CHIPS);
    expect(result.more).toHaveLength(2);
    expect(result.shown[0].label).toBe("A");
    expect(result.more[0].label).toBe("E");
  });
});

describe("headline", () => {
  it("returns label of worst non-context signal", () => {
    const signals = [
      { label: "✗ CI failing: lint", tone: "danger" as const },
      { label: "2 open threads", tone: "warning" as const },
    ];
    expect(headline(signals)).toBe("✗ CI failing: lint");
  });

  it("returns empty string when no signals", () => {
    expect(headline([])).toBe("");
  });
});

describe("PRIORITY constant", () => {
  it("has correct priority order", () => {
    expect(PRIORITY.danger).toBeLessThan(PRIORITY.warning);
    expect(PRIORITY.warning).toBeLessThan(PRIORITY.info);
    expect(PRIORITY.info).toBeLessThan(PRIORITY.success);
    expect(PRIORITY.success).toBeLessThan(PRIORITY.purple);
    expect(PRIORITY.purple).toBeLessThan(PRIORITY.neutral);
  });
});
