import { describe, it, expect } from "vitest";
import {
  deriveApprovedBy,
  deriveParticipants,
  deriveReviewStatus,
  deriveViewerReview,
  mapGraphQLPr,
} from "./mapping";

const r = (login: string, state: string) => ({ state, author: { login } });

describe("deriveReviewStatus", () => {
  it("keeps an approval when the reviewer later leaves a comment-only review", () => {
    expect(deriveReviewStatus([r("bob", "APPROVED"), r("bob", "COMMENTED")])).toBe("APPROVED");
  });

  it("ignores the author's own replies and bots", () => {
    const reviews = [r("me", "COMMENTED"), r("copilot-pull-request-reviewer[bot]", "COMMENTED")];
    expect(deriveReviewStatus(reviews, { author: "me" })).toBeNull();
  });

  it("lets a later approval replace changes requested", () => {
    expect(deriveReviewStatus([r("bob", "CHANGES_REQUESTED"), r("bob", "APPROVED")])).toBe(
      "APPROVED",
    );
  });

  it("treats a dismissed review as a comment", () => {
    expect(deriveReviewStatus([r("bob", "APPROVED"), r("bob", "DISMISSED")])).toBe("REVIEWED");
  });

  it("prefers GitHub's reviewDecision, even without fetched reviews", () => {
    expect(deriveReviewStatus(undefined, { reviewDecision: "APPROVED" })).toBe("APPROVED");
    expect(
      deriveReviewStatus([r("bob", "APPROVED")], { reviewDecision: "CHANGES_REQUESTED" }),
    ).toBe("CHANGES_REQUESTED");
  });

  it("doesn't report approved while GitHub still requires reviews", () => {
    expect(
      deriveReviewStatus([r("bob", "APPROVED")], { reviewDecision: "REVIEW_REQUIRED" }),
    ).toBeNull();
  });
});

describe("mapGraphQLPr requested_reviewers", () => {
  it("maps users and teams, and leaves it undefined when not fetched", () => {
    const node = {
      reviewRequests: {
        nodes: [
          { requestedReviewer: { login: "guru" } },
          { requestedReviewer: { name: "cmp-team" } },
          { requestedReviewer: null },
        ],
      },
    };
    expect(mapGraphQLPr(node).requested_reviewers).toEqual(["guru", "cmp-team"]);
    expect(mapGraphQLPr({}).requested_reviewers).toBeUndefined();
  });
});

describe("mapGraphQLPr head", () => {
  it("carries the head commit's sha, and leaves it out when not fetched", () => {
    expect(mapGraphQLPr({ headRefName: "feat", headRefOid: "abc123" }).head).toEqual({
      ref: "feat",
      sha: "abc123",
    });
    expect(mapGraphQLPr({ headRefName: "feat" }).head).toEqual({ ref: "feat" });
  });
});

describe("deriveParticipants", () => {
  const c = (login: string) => ({ author: { login } });

  it("is undefined when neither reviews nor comments were fetched", () => {
    expect(deriveParticipants({})).toBeUndefined();
    expect(mapGraphQLPr({}).participants).toBeUndefined();
  });

  it("lists reviewers and commenters once each, skipping the author and bots", () => {
    const node = {
      author: { login: "me" },
      reviews: { nodes: [r("bob", "COMMENTED"), r("me", "COMMENTED"), r("bob", "APPROVED")] },
      comments: { nodes: [c("carol"), c("github-actions[bot]"), c("Bob")] },
      reviewThreads: { nodes: [{ comments: { nodes: [c("dave"), c("me")] } }] },
    };
    expect(deriveParticipants(node)).toEqual([
      { login: "bob", state: "APPROVED" },
      { login: "carol", state: "COMMENTED" },
      { login: "dave", state: "COMMENTED" },
    ]);
  });

  it("keeps a decision through later comments, drops it on dismissal, ignores pending", () => {
    const node = {
      reviews: {
        nodes: [
          r("bob", "CHANGES_REQUESTED"),
          r("bob", "COMMENTED"),
          r("eve", "APPROVED"),
          r("eve", "DISMISSED"),
          r("zed", "PENDING"),
        ],
      },
    };
    expect(deriveParticipants(node)).toEqual([
      { login: "bob", state: "CHANGES_REQUESTED" },
      { login: "eve", state: "COMMENTED" },
    ]);
  });
});

describe("deriveApprovedBy", () => {
  it("is undefined when latestOpinionatedReviews wasn't fetched", () => {
    expect(deriveApprovedBy({})).toBeUndefined();
    expect(mapGraphQLPr({}).approved_by).toBeUndefined();
  });

  it("keeps approvers only, skipping the author, bots and missing authors", () => {
    const node = {
      author: { login: "me" },
      latestOpinionatedReviews: {
        nodes: [
          r("bob", "APPROVED"),
          r("carol", "CHANGES_REQUESTED"),
          r("dave", "DISMISSED"),
          r("Me", "APPROVED"),
          r("renovate[bot]", "APPROVED"),
          { state: "APPROVED", author: null },
          r("eve", "APPROVED"),
        ],
      },
    };
    expect(deriveApprovedBy(node)).toEqual(["bob", "eve"]);
    expect(mapGraphQLPr(node).approved_by).toEqual(["bob", "eve"]);
  });
});

describe("deriveViewerReview", () => {
  const review = (login: string, state: string, submittedAt: string) => ({
    state,
    submittedAt,
    author: { login },
  });
  const pr = (reviews: any[], committedDate = "2026-10-01T00:00:00Z") => ({
    reviews: { nodes: reviews },
    commits: { nodes: [{ commit: { committedDate } }] },
  });

  it("is empty when the viewer hasn't reviewed", () => {
    expect(
      deriveViewerReview(pr([review("bob", "APPROVED", "2026-10-02T00:00:00Z")]), "me"),
    ).toEqual({
      viewer_review_state: null,
      viewer_reviewed_at: null,
      new_commits_since_review: false,
    });
    expect(deriveViewerReview({}, "me").viewer_review_state).toBeNull();
  });

  it("ignores dismissed and pending reviews", () => {
    const node = pr([
      review("me", "DISMISSED", "2026-09-01T00:00:00Z"),
      review("me", "PENDING", "2026-09-02T00:00:00Z"),
    ]);
    expect(deriveViewerReview(node, "me")).toEqual({
      viewer_review_state: null,
      viewer_reviewed_at: null,
      new_commits_since_review: false,
    });
  });

  it("reports a comment-only review", () => {
    const node = pr([review("Me", "COMMENTED", "2026-10-02T00:00:00Z")]);
    expect(deriveViewerReview(node, "me")).toMatchObject({
      viewer_review_state: "COMMENTED",
      viewer_reviewed_at: "2026-10-02T00:00:00Z",
    });
  });

  it("uses the viewer's latest review, skipping a later dismissal", () => {
    const node = pr([
      review("me", "CHANGES_REQUESTED", "2026-09-20T00:00:00Z"),
      review("me", "APPROVED", "2026-09-25T00:00:00Z"),
      review("bob", "COMMENTED", "2026-09-28T00:00:00Z"),
      review("me", "DISMISSED", "2026-09-29T00:00:00Z"),
    ]);
    expect(deriveViewerReview(node, "me")).toMatchObject({
      viewer_review_state: "APPROVED",
      viewer_reviewed_at: "2026-09-25T00:00:00Z",
    });
  });

  it("flags commits newer than the viewer's review", () => {
    const reviews = [review("me", "APPROVED", "2026-10-02T00:00:00Z")];
    expect(
      deriveViewerReview(pr(reviews, "2026-10-03T00:00:00Z"), "me").new_commits_since_review,
    ).toBe(true);
    expect(
      deriveViewerReview(pr(reviews, "2026-10-01T00:00:00Z"), "me").new_commits_since_review,
    ).toBe(false);
  });
});
