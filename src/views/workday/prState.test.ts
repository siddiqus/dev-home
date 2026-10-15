import { describe, it, expect } from "vitest";
import type { GitHubPR } from "../../types";
import {
  myPRState,
  NO_PR_YET,
  repoRef,
  reviewingState,
  titleWithoutKey,
  worstState,
} from "./prState";

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

describe("myPRState", () => {
  it("returns each state with its tone", () => {
    expect(myPRState(pr(1, { checks_status: "FAILURE" }))).toEqual({
      label: "Fix CI",
      tone: "danger",
    });
    expect(myPRState(pr(1, { checks_status: "TIMED_OUT" })).label).toBe("Fix CI");
    expect(myPRState(pr(1, { has_conflict: true }))).toEqual({
      label: "Resolve conflict with main",
      tone: "danger",
    });
    expect(myPRState(pr(1, { review_status: "CHANGES_REQUESTED" }))).toEqual({
      label: "Address requested changes",
      tone: "danger",
    });
    expect(myPRState(pr(1, { draft: true }))).toEqual({
      label: "Draft · mark ready for review",
      tone: "neutral",
    });
    expect(myPRState(pr(1, { in_merge_queue: true }))).toEqual({
      label: "In merge queue",
      tone: "purple",
    });
    expect(myPRState(pr(1, { requested_reviewers: [] }))).toEqual({
      label: "Request a review",
      tone: "warning",
    });
    expect(myPRState(pr(1, { review_status: "APPROVED" }))).toEqual({
      label: "Approved · merge when CI passes",
      tone: "success",
    });
    expect(myPRState(pr(1, { requested_reviewers: ["tomas", "cmp-fe"] }))).toEqual({
      label: "Waiting on tomas, cmp-fe",
      tone: "neutral",
    });
    expect(myPRState(pr(1, { requested_reviewers: [], review_status: "REVIEWED" }))).toEqual({
      label: "Re-request review",
      tone: "warning",
    });
    expect(
      myPRState(pr(1, { requested_reviewers: [], review_status: "REVIEWED", your_turn: true })),
    ).toEqual({ label: "Respond to feedback", tone: "warning" });
    expect(myPRState(pr(1, { review_status: "APPROVED", checks_status: "SUCCESS" }))).toEqual({
      label: "Ready to merge",
      tone: "success",
    });
    expect(myPRState(pr(1, { requested_reviewers: undefined }))).toEqual({
      label: "Waiting for review",
      tone: "neutral",
    });
  });

  it("follows severity order when several apply", () => {
    const all = {
      checks_status: "FAILURE",
      has_conflict: true,
      review_status: "CHANGES_REQUESTED",
      draft: true,
      requested_reviewers: [],
    };
    expect(myPRState(pr(1, all)).label).toBe("Fix CI");
    expect(myPRState(pr(1, { ...all, checks_status: "SUCCESS" })).label).toBe(
      "Resolve conflict with main",
    );
    expect(myPRState(pr(1, { ...all, checks_status: null, has_conflict: false })).label).toBe(
      "Address requested changes",
    );
    // Drafts skip the review states.
    const draft = "Draft · mark ready for review";
    expect(myPRState(pr(1, { draft: true, requested_reviewers: [] })).label).toBe(draft);
    expect(myPRState(pr(1, { draft: true, review_status: "APPROVED" })).label).toBe(draft);
    // Queued beats approved.
    expect(myPRState(pr(1, { in_merge_queue: true, review_status: "APPROVED" })).label).toBe(
      "In merge queue",
    );
  });
});

describe("worstState", () => {
  it("is No PR yet without PRs", () => {
    expect(worstState([])).toEqual(NO_PR_YET);
    expect(NO_PR_YET).toEqual({ label: "No PR yet", tone: "neutral" });
  });

  it("picks the most severe state across PRs", () => {
    const draft = pr(1, { draft: true });
    const waiting = pr(2);
    const approved = pr(3, { review_status: "APPROVED" });
    const lonely = pr(4, { requested_reviewers: [] });
    const cr = pr(5, { review_status: "CHANGES_REQUESTED" });
    const conflict = pr(6, { has_conflict: true });
    const red = pr(7, { checks_status: "FAILURE" });

    expect(worstState([draft]).label).toBe("Draft · mark ready for review");
    expect(worstState([draft, waiting]).label).toBe("Waiting on guru");
    expect(worstState([draft, waiting, approved]).label).toBe("Approved · merge when CI passes");
    expect(worstState([approved, lonely, draft]).label).toBe("Request a review");
    expect(worstState([lonely, cr]).label).toBe("Address requested changes");
    expect(worstState([cr, conflict]).label).toBe("Resolve conflict with main");
    expect(worstState([conflict, red, draft]).label).toBe("Fix CI");
    // Order of the input doesn't matter.
    expect(worstState([red, draft, waiting])).toEqual(worstState([waiting, draft, red]));
  });
});

describe("reviewingState", () => {
  it("covers requested, re-requested, new commits and waiting on author", () => {
    expect(reviewingState(pr(1), true)).toBe("requested");
    expect(reviewingState(pr(1, { viewer_engaged: true }), true)).toBe("re-requested");
    // A request wins over new commits.
    expect(
      reviewingState(
        pr(1, { new_commits_since_review: true, viewer_review_state: "COMMENTED" }),
        true,
      ),
    ).toBe("requested");
    expect(
      reviewingState(
        pr(1, { new_commits_since_review: true, viewer_review_state: "CHANGES_REQUESTED" }),
        false,
      ),
    ).toBe("new-commits");
    expect(
      reviewingState(
        pr(1, { new_commits_since_review: true, viewer_review_state: "APPROVED" }),
        false,
      ),
    ).toBe("waiting-author");
    expect(reviewingState(pr(1, { viewer_review_state: "COMMENTED" }), false)).toBe(
      "waiting-author",
    );
    expect(reviewingState(pr(1), false)).toBe("waiting-author");
  });
});

describe("repoRef", () => {
  it("is repo#number", () => {
    expect(repoRef(pr(12, { repo_full_name: "org/dev-home" }))).toBe("dev-home#12");
  });
});

describe("titleWithoutKey", () => {
  it("drops a leading key and separators", () => {
    expect(titleWithoutKey("CCP-1: Fix the thing", "CCP-1")).toBe("Fix the thing");
    expect(titleWithoutKey("CCP-1 - Fix", "CCP-1")).toBe("Fix");
    expect(titleWithoutKey("CCP-1 — Fix", "CCP-1")).toBe("Fix");
    expect(titleWithoutKey("ccp-1 fix", "CCP-1")).toBe("fix");
  });

  it("leaves the title alone otherwise", () => {
    expect(titleWithoutKey("Fix CCP-1", "CCP-1")).toBe("Fix CCP-1");
    expect(titleWithoutKey("CCP-12 Fix", "CCP-1")).toBe("CCP-12 Fix");
    expect(titleWithoutKey("CCP-1 Fix", null)).toBe("CCP-1 Fix");
    // A title that is only the key keeps the key.
    expect(titleWithoutKey("CCP-1", "CCP-1")).toBe("CCP-1");
  });
});
