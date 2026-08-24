import { describe, it, expect } from "vitest";
import { computeReviewQueue } from "./reviewQueue";
import type { RawPR } from "../teamAggregation";

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
  it("rule 1: draft -> author/draft", () => {
    const [e] = computeReviewQueue([mkPr({ isDraft: true, requestedReviewers: userReq("bob") })]);
    expect(e.state).toBe("author");
    expect(e.reason).toBe("draft");
  });

  it("rule 2: no reviewer requested and none engaged -> none", () => {
    const [e] = computeReviewQueue([mkPr({})]);
    expect(e.state).toBe("none");
    expect(e.reason).toBe("no reviewer assigned");
  });

  it("rule 3: changes requested -> author", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviewDecision: "CHANGES_REQUESTED",
        reviews: [{ login: "bob", typename: "User", state: "CHANGES_REQUESTED", submittedAt: "2026-08-02T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("author");
    expect(e.reason).toBe("changes requested");
  });

  it("rule 4: reviewer acted after author, not approved -> author/awaiting author", () => {
    const [e] = computeReviewQueue([
      mkPr({
        lastCommitAt: "2026-08-01T00:00:00Z",
        reviews: [{ login: "bob", typename: "User", state: "COMMENTED", submittedAt: "2026-08-03T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("author");
    expect(e.reason).toBe("reviewer reviewed, awaiting author");
  });

  it("rule 4: approved and reviewer acted last -> ready to merge", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviewDecision: "APPROVED",
        lastCommitAt: "2026-08-01T00:00:00Z",
        reviews: [{ login: "bob", typename: "User", state: "APPROVED", submittedAt: "2026-08-03T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("author");
    expect(e.reason).toBe("approved — ready to merge");
  });

  it("rule 5: approved but author pushed after -> still ready to merge", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviewDecision: "APPROVED",
        lastCommitAt: "2026-08-05T00:00:00Z",
        reviews: [{ login: "bob", typename: "User", state: "APPROVED", submittedAt: "2026-08-03T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("author");
    expect(e.reason).toBe("approved — ready to merge");
  });

  it("rule 6: engaged, author committed last -> reviewer/awaiting re-review", () => {
    const [e] = computeReviewQueue([
      mkPr({
        lastCommitAt: "2026-08-05T00:00:00Z",
        reviews: [{ login: "bob", typename: "User", state: "COMMENTED", submittedAt: "2026-08-03T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("reviewer");
    expect(e.reason).toBe("author responded, awaiting re-review");
  });

  it("rule 7: requested, nobody engaged -> reviewer/awaiting first review", () => {
    const [e] = computeReviewQueue([mkPr({ requestedReviewers: userReq("bob") })]);
    expect(e.state).toBe("reviewer");
    expect(e.reason).toBe("awaiting first review");
  });

  it("a bot review does not count as engagement", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviews: [{ login: "github-actions", typename: "Bot", state: "COMMENTED", submittedAt: "2026-08-03T00:00:00Z" }],
      }),
    ]);
    expect(e.state).toBe("none");
  });

  it("a team-only review request does not count as a reviewer", () => {
    const [e] = computeReviewQueue([
      mkPr({ requestedReviewers: [{ typename: "Team", login: "cmp-ui" }] }),
    ]);
    expect(e.state).toBe("none");
  });

  it("reviewers list has engaged persons first, then pending requests, bots/teams excluded", () => {
    const [e] = computeReviewQueue([
      mkPr({
        reviews: [
          { login: "bob", typename: "User", state: "COMMENTED", submittedAt: "2026-08-02T00:00:00Z" },
          { login: "carol", typename: "User", state: "APPROVED", submittedAt: "2026-08-04T00:00:00Z" },
          { login: "ci", typename: "Bot", state: "COMMENTED", submittedAt: "2026-08-05T00:00:00Z" },
        ],
        requestedReviewers: [{ typename: "User", login: "dave" }, { typename: "Team", login: "cmp-ui" }],
      }),
    ]);
    // carol reviewed most recently, then bob, then still-pending dave; no ci, no team
    expect(e.reviewers).toEqual(["carol", "bob", "dave"]);
  });

  it("excludes non-open PRs", () => {
    const out = computeReviewQueue([mkPr({ state: "merged" }), mkPr({ number: 2, state: "closed" })]);
    expect(out).toHaveLength(0);
  });

  it("sorts oldest-activity-first (ascending updatedAt)", () => {
    const out = computeReviewQueue([
      mkPr({ number: 1, updatedAt: "2026-08-10T00:00:00Z", requestedReviewers: userReq("bob") }),
      mkPr({ number: 2, updatedAt: "2026-08-01T00:00:00Z", requestedReviewers: userReq("bob") }),
    ]);
    expect(out.map((e) => e.number)).toEqual([2, 1]);
  });
});
