import { describe, it, expect } from "vitest";
import type { GitHubPR } from "../types";
import { authorAction, prAction, restatedReasons, reviewerAction } from "./prAction";

function pr(o: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 1,
    title: "PR",
    html_url: "https://github.com/o/r/pull/1",
    state: "open",
    draft: false,
    created_at: "2026-10-09T10:00:00Z",
    updated_at: "2026-10-10T10:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: "feature" },
    base: { ref: "main" },
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    requested_reviewers: [],
    ...o,
  };
}

describe("authorAction", () => {
  it("asks me to respond when a reviewer only commented and it's my turn", () => {
    // newscred/open-api-docs#419: a COMMENTED review, request cleared, nobody pending.
    const a = authorAction(
      pr({ review_status: "REVIEWED", your_turn: true, checks_status: "SUCCESS" }),
    );
    expect(a).toMatchObject({ label: "Respond to feedback", tone: "warning" });
  });

  it("asks for a review when nobody is requested, even with a failing optional check", () => {
    // newscred/renditions-service#548: no reviews, a non-required check failing.
    const a = authorAction(
      pr({ checks_status: "SUCCESS", optional_checks_failing: ["integration-test"] }),
    );
    expect(a).toMatchObject({ label: "Request a review", tone: "warning" });
  });

  it("says who I'm waiting on, even with open threads that aren't my turn", () => {
    const a = authorAction(pr({ requested_reviewers: ["guru"], unresolved_thread_count: 2 }));
    expect(a).toMatchObject({ label: "Waiting on guru", tone: "neutral" });
  });

  it("ranks blocking work ahead of waiting", () => {
    const red = authorAction(pr({ checks_status: "FAILURE" }));
    const waiting = authorAction(pr({ requested_reviewers: ["guru"] }));
    expect(red.rank).toBeLessThan(waiting.rank);
  });
});

describe("reviewerAction", () => {
  it("covers each reviewer step", () => {
    expect(reviewerAction(pr(), true).label).toBe("Review requested");
    expect(reviewerAction(pr({ viewer_engaged: true }), true).label).toBe(
      "Re-review requested by me",
    );
    expect(
      reviewerAction(
        pr({ new_commits_since_review: true, viewer_review_state: "COMMENTED" }),
        false,
      ).label,
    ).toBe("New commits since your review");
    expect(reviewerAction(pr({ viewer_review_state: "APPROVED" }), false).label).toBe(
      "You approved · nothing to do",
    );
    expect(reviewerAction(pr({ viewer_review_state: "COMMENTED" }), false).label).toBe(
      "Waiting on author",
    );
    expect(reviewerAction(pr({ draft: true }), true).label).toBe("Draft · no review yet");
  });
});

describe("prAction", () => {
  it("picks the author seat for my PRs, case-insensitively", () => {
    expect(prAction(pr(), "ME")?.label).toBe("Request a review");
  });

  it("picks the reviewer seat when I'm requested or have reviewed", () => {
    const theirs = { user: { login: "alice", avatar_url: "" } };
    expect(prAction(pr({ ...theirs, requested_reviewers: ["me"] }), "me")?.label).toBe(
      "Review requested",
    );
    expect(prAction(pr({ ...theirs, viewer_review_state: "APPROVED" }), "me")?.label).toBe(
      "You approved · nothing to do",
    );
  });

  it("is null for PRs I'm not involved in, closed PRs, or without a viewer", () => {
    expect(prAction(pr({ user: { login: "alice", avatar_url: "" } }), "me")).toBeNull();
    expect(prAction(pr({ merged_at: "2026-10-10T00:00:00Z" }), "me")).toBeNull();
    expect(prAction(pr(), "")).toBeNull();
  });
});

describe("restatedReasons", () => {
  it("lets Respond to feedback cover the Reviewed, Your turn and Unresolved chips", () => {
    expect(
      restatedReasons(authorAction(pr({ review_status: "REVIEWED", your_turn: true }))),
    ).toEqual(["your_turn", "reviewed", "unresolved"]);
    expect(restatedReasons(null)).toEqual([]);
  });
});
