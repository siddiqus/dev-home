import { describe, it, expect } from "vitest";
import { mapPullRequestNode, dedupePRs } from "./prFetch";
import type { RawPR } from "../teamAggregation";

const node = {
  number: 7,
  title: "OPAL-7: thing",
  url: "https://github.com/org/repo/pull/7",
  state: "OPEN",
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-04T00:00:00Z",
  mergedAt: null,
  headRefName: "feat/x",
  body: "body",
  isDraft: true,
  reviewDecision: "CHANGES_REQUESTED",
  author: { login: "carol" },
  repository: { nameWithOwner: "org/repo" },
  commits: { nodes: [{ commit: { committedDate: "2026-08-03T00:00:00Z", statusCheckRollup: { state: "FAILURE" } } }] },
  reviews: {
    nodes: [
      { author: { login: "bob", __typename: "User" }, state: "CHANGES_REQUESTED", submittedAt: "2026-08-02T00:00:00Z" },
      { author: { login: "ci", __typename: "Bot" }, state: "COMMENTED", submittedAt: "2026-08-02T06:00:00Z" },
    ],
  },
  reviewRequests: {
    totalCount: 2,
    nodes: [
      { requestedReviewer: { __typename: "User", login: "dave" } },
      { requestedReviewer: { __typename: "Team", name: "cmp-ui" } },
    ],
  },
};

describe("mapPullRequestNode", () => {
  it("maps new + legacy fields", () => {
    const pr = mapPullRequestNode(node, "fallback");
    expect(pr.number).toBe(7);
    expect(pr.repo_full_name).toBe("org/repo");
    expect(pr.state).toBe("open");
    expect(pr.author).toBe("carol");
    expect(pr.updatedAt).toBe("2026-08-04T00:00:00Z");
    expect(pr.isDraft).toBe(true);
    expect(pr.reviewDecision).toBe("CHANGES_REQUESTED");
    expect(pr.lastCommitAt).toBe("2026-08-03T00:00:00Z");
    expect(pr.checks_status).toBe("FAILURE");
    // structured reviews carry typename
    expect(pr.reviews).toEqual([
      { login: "bob", typename: "User", state: "CHANGES_REQUESTED", submittedAt: "2026-08-02T00:00:00Z" },
      { login: "ci", typename: "Bot", state: "COMMENTED", submittedAt: "2026-08-02T06:00:00Z" },
    ]);
    expect(pr.requestedReviewers).toEqual([
      { typename: "User", login: "dave" },
      { typename: "Team", login: "cmp-ui" },
    ]);
    // legacy scalars preserved
    expect(pr.first_review_at).toBe("2026-08-02T00:00:00Z");
    expect(pr.review_state).toBe("CHANGES_REQUESTED");
    expect(pr.review_requested).toBe(true);
  });

  it("uses fallbackLogin only when author is missing", () => {
    const pr = mapPullRequestNode({ ...node, author: null }, "fallback");
    expect(pr.author).toBe("fallback");
  });
});

describe("dedupePRs", () => {
  it("unions by repo#number, keeping the first occurrence, incl. external-author PRs", () => {
    const a: RawPR = { number: 1, title: "t", repo_full_name: "org/repo", html_url: "u", state: "open", checks_status: null, author: "alice", created_at: "2026-08-01T00:00:00Z" };
    const dup: RawPR = { ...a, title: "dup-should-be-dropped" };
    const external: RawPR = { ...a, number: 2, author: "outsider" };
    const out = dedupePRs([a, dup, external]);
    expect(out).toHaveLength(2);
    expect(out.find((p) => p.number === 1)?.title).toBe("t");
    expect(out.find((p) => p.number === 2)?.author).toBe("outsider");
  });
});
