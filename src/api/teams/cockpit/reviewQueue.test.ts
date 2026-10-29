import { describe, it, expect } from "vitest";
import { computeReviewQueue } from "./reviewQueue";
import type { RawPR } from "../aggregation";

function mkPr(overrides: Partial<RawPR>): RawPR {
  return {
    number: 1,
    title: "OPAL-1: thing",
    repo_full_name: "org/repo",
    html_url: "https://github.com/org/repo/pull/1",
    state: "open",
    checks_status: null,
    author: "alice",
    created_at: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    isDraft: false,
    reviewDecision: null,
    lastCommitAt: "2026-08-01T00:00:00Z",
    reviews: [],
    requestedReviewers: [],
    ...overrides,
  };
}
const userReq = (login: string): RawPR["requestedReviewers"] => [{ typename: "User", login }];

describe("computeReviewQueue", () => {
  it("rule 1: draft -> draft", () => {
    const [e] = computeReviewQueue([mkPr({ isDraft: true, requestedReviewers: userReq("bob") })]);
    expect(e.state).toBe("draft");
    expect(e.reason).toBe("draft");
  });

  it("rule 2: no reviewer requested and none engaged -> needsReviewer", () => {
    const [e] = computeReviewQueue([mkPr({})]);
    expect(e.state).toBe("needsReviewer");
    expect(e.reason).toBe("no reviewer assigned");
  });

  it("rule 3: changes requested -> withAuthor", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviewDecision: "CHANGES_REQUESTED",
        reviews: [
          {
            login: "bob",
            typename: "User",
            state: "CHANGES_REQUESTED",
            submittedAt: "2026-08-02T00:00:00Z",
          },
        ],
      }),
    ]);
    expect(e.state).toBe("withAuthor");
    expect(e.reason).toBe("changes requested");
  });

  it("rule 4: reviewer acted after author, not approved -> withAuthor", () => {
    const [e] = computeReviewQueue([
      mkPr({
        lastCommitAt: "2026-08-01T00:00:00Z",
        reviews: [
          {
            login: "bob",
            typename: "User",
            state: "COMMENTED",
            submittedAt: "2026-08-03T00:00:00Z",
          },
        ],
      }),
    ]);
    expect(e.state).toBe("withAuthor");
    expect(e.reason).toBe("reviewer reviewed, awaiting author");
  });

  it("rule 4: approved and reviewer acted last -> readyToMerge", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviewDecision: "APPROVED",
        lastCommitAt: "2026-08-01T00:00:00Z",
        reviews: [
          {
            login: "bob",
            typename: "User",
            state: "APPROVED",
            submittedAt: "2026-08-03T00:00:00Z",
          },
        ],
      }),
    ]);
    expect(e.state).toBe("readyToMerge");
    expect(e.reason).toBe("approved — ready to merge");
  });

  it("rule 5: approved but author pushed after -> still readyToMerge", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviewDecision: "APPROVED",
        lastCommitAt: "2026-08-05T00:00:00Z",
        reviews: [
          {
            login: "bob",
            typename: "User",
            state: "APPROVED",
            submittedAt: "2026-08-03T00:00:00Z",
          },
        ],
      }),
    ]);
    expect(e.state).toBe("readyToMerge");
    expect(e.reason).toBe("approved — ready to merge");
  });

  it("rule 6: engaged, author committed last -> waitingReview (re-review)", () => {
    const [e] = computeReviewQueue([
      mkPr({
        lastCommitAt: "2026-08-05T00:00:00Z",
        reviews: [
          {
            login: "bob",
            typename: "User",
            state: "COMMENTED",
            submittedAt: "2026-08-03T00:00:00Z",
          },
        ],
      }),
    ]);
    expect(e.state).toBe("waitingReview");
    expect(e.reason).toBe("author responded, awaiting re-review");
  });

  it("rule 7: requested, nobody engaged -> waitingReview (first review)", () => {
    const [e] = computeReviewQueue([mkPr({ requestedReviewers: userReq("bob") })]);
    expect(e.state).toBe("waitingReview");
    expect(e.reason).toBe("awaiting first review");
  });

  it("a bot review does not count as engagement", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviews: [
          {
            login: "github-actions",
            typename: "Bot",
            state: "COMMENTED",
            submittedAt: "2026-08-03T00:00:00Z",
          },
        ],
      }),
    ]);
    expect(e.state).toBe("needsReviewer");
  });

  it("a team-only review request does not count as a reviewer", () => {
    const [e] = computeReviewQueue([
      mkPr({ requestedReviewers: [{ typename: "Team", login: "cmp-ui" }] }),
    ]);
    expect(e.state).toBe("needsReviewer");
  });

  it("reviewers list has engaged persons first, then pending requests, bots/teams excluded", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviews: [
          {
            login: "bob",
            typename: "User",
            state: "COMMENTED",
            submittedAt: "2026-08-02T00:00:00Z",
          },
          {
            login: "carol",
            typename: "User",
            state: "APPROVED",
            submittedAt: "2026-08-04T00:00:00Z",
          },
          { login: "ci", typename: "Bot", state: "COMMENTED", submittedAt: "2026-08-05T00:00:00Z" },
        ],
        requestedReviewers: [
          { typename: "User", login: "dave" },
          { typename: "Team", login: "cmp-ui" },
        ],
      }),
    ]);
    // carol reviewed most recently, then bob, then still-pending dave; no ci, no team
    expect(e.reviewers).toEqual(["carol", "bob", "dave"]);
  });

  it("excludes non-open PRs", () => {
    const out = computeReviewQueue([
      mkPr({ state: "merged" }),
      mkPr({ number: 2, state: "closed" }),
    ]);
    expect(out).toHaveLength(0);
  });

  describe("waitingSince — when the ball moved to whoever has it now", () => {
    const review = (submittedAt: string, state = "COMMENTED") => ({
      login: "bob",
      typename: "User",
      state,
      submittedAt,
    });

    it("first review: since the PR was opened", () => {
      const [e] = computeReviewQueue([
        mkPr({
          created_at: "2026-08-01T00:00:00Z",
          lastCommitAt: "2026-08-04T00:00:00Z",
          requestedReviewers: userReq("bob"),
        }),
      ]);
      expect(e.waitingSince).toBe("2026-08-01T00:00:00.000Z");
    });

    it("no reviewer: since the PR was opened", () => {
      const [e] = computeReviewQueue([mkPr({ created_at: "2026-08-02T00:00:00Z" })]);
      expect(e.waitingSince).toBe("2026-08-02T00:00:00.000Z");
    });

    it("re-review: since the author's last push", () => {
      const [e] = computeReviewQueue([
        mkPr({ lastCommitAt: "2026-08-05T00:00:00Z", reviews: [review("2026-08-03T00:00:00Z")] }),
      ]);
      expect(e.waitingSince).toBe("2026-08-05T00:00:00.000Z");
    });

    it("back with author: since the last review", () => {
      const [e] = computeReviewQueue([
        mkPr({
          reviewDecision: "CHANGES_REQUESTED",
          lastCommitAt: "2026-08-01T00:00:00Z",
          reviews: [review("2026-08-03T00:00:00Z", "CHANGES_REQUESTED")],
        }),
      ]);
      expect(e.waitingSince).toBe("2026-08-03T00:00:00.000Z");
    });

    it("ready to merge: since the later of the approval and the last push", () => {
      const approvedLast = computeReviewQueue([
        mkPr({
          reviewDecision: "APPROVED",
          lastCommitAt: "2026-08-01T00:00:00Z",
          reviews: [review("2026-08-03T00:00:00Z", "APPROVED")],
        }),
      ])[0];
      expect(approvedLast.waitingSince).toBe("2026-08-03T00:00:00.000Z");

      const pushedLast = computeReviewQueue([
        mkPr({
          reviewDecision: "APPROVED",
          lastCommitAt: "2026-08-05T00:00:00Z",
          reviews: [review("2026-08-03T00:00:00Z", "APPROVED")],
        }),
      ])[0];
      expect(pushedLast.waitingSince).toBe("2026-08-05T00:00:00.000Z");
    });

    it("is null when there is no usable timestamp", () => {
      const [e] = computeReviewQueue([mkPr({ created_at: "", lastCommitAt: null })]);
      expect(e.waitingSince).toBeNull();
    });
  });

  it("sorts most urgent first: by state, then longest wait", () => {
    const out = computeReviewQueue([
      mkPr({ number: 1, isDraft: true, created_at: "2026-07-01T00:00:00Z" }),
      mkPr({
        number: 2,
        reviewDecision: "CHANGES_REQUESTED",
        reviews: [
          {
            login: "bob",
            typename: "User",
            state: "CHANGES_REQUESTED",
            submittedAt: "2026-07-02T00:00:00Z",
          },
        ],
      }),
      mkPr({
        number: 3,
        reviewDecision: "APPROVED",
        reviews: [
          {
            login: "bob",
            typename: "User",
            state: "APPROVED",
            submittedAt: "2026-08-02T00:00:00Z",
          },
        ],
      }),
      mkPr({ number: 4, created_at: "2026-08-03T00:00:00Z", requestedReviewers: userReq("bob") }),
      mkPr({ number: 5, created_at: "2026-08-01T00:00:00Z", requestedReviewers: userReq("bob") }),
      mkPr({ number: 6, created_at: "2026-08-04T00:00:00Z" }),
    ]);
    expect(out.map((e) => [e.number, e.state])).toEqual([
      [6, "needsReviewer"],
      [5, "waitingReview"],
      [4, "waitingReview"],
      [3, "readyToMerge"],
      [2, "withAuthor"],
      [1, "draft"],
    ]);
  });
});
