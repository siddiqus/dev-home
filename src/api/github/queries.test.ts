import { describe, it, expect } from "vitest";
import {
  PR_BODY_QUERY,
  REVIEW_SEARCH_QUERY,
  SEARCH_MERGED_PRS_QUERY,
  SEARCH_MY_PRS_QUERY,
  SEARCH_ORG_PRS_QUERY,
  SINGLE_PR_QUERY,
} from "./queries";

describe("open-PR queries", () => {
  // mapGraphQLPr derives has_conflict from `mergeable`; a query that omits it
  // silently hides the "Merge conflict" chip on that page.
  it.each([
    ["REVIEW_SEARCH_QUERY", REVIEW_SEARCH_QUERY],
    ["SEARCH_MY_PRS_QUERY", SEARCH_MY_PRS_QUERY],
    ["SEARCH_ORG_PRS_QUERY", SEARCH_ORG_PRS_QUERY],
    ["SINGLE_PR_QUERY", SINGLE_PR_QUERY],
  ])("%s selects mergeable", (_name, query) => {
    expect(query).toMatch(/\bmergeable\b/);
  });
});

describe("mergeStateStatus is not fetched", () => {
  // GitHub computes it per PR on read (~2s per search) and nothing renders it.
  it.each([
    ["REVIEW_SEARCH_QUERY", REVIEW_SEARCH_QUERY],
    ["SEARCH_MY_PRS_QUERY", SEARCH_MY_PRS_QUERY],
    ["SEARCH_ORG_PRS_QUERY", SEARCH_ORG_PRS_QUERY],
    ["SINGLE_PR_QUERY", SINGLE_PR_QUERY],
  ])("%s omits mergeStateStatus", (_name, query) => {
    expect(query).not.toMatch(/\bmergeStateStatus\b/);
  });
});

describe("PR body is lazy", () => {
  // Lists never render the description; it's fetched when a modal opens.
  it.each([
    ["REVIEW_SEARCH_QUERY", REVIEW_SEARCH_QUERY],
    ["SEARCH_MY_PRS_QUERY", SEARCH_MY_PRS_QUERY],
    ["SEARCH_ORG_PRS_QUERY", SEARCH_ORG_PRS_QUERY],
    ["SEARCH_MERGED_PRS_QUERY", SEARCH_MERGED_PRS_QUERY],
  ])("%s does not select body", (_name, query) => {
    expect(query).not.toMatch(/\bbody\b/);
  });

  it.each([
    ["SINGLE_PR_QUERY", SINGLE_PR_QUERY],
    ["PR_BODY_QUERY", PR_BODY_QUERY],
  ])("%s selects body", (_name, query) => {
    expect(query).toMatch(/\bbody\b/);
  });
});

describe("merged-PR query", () => {
  // mapGraphQLPr derives approved_by from it; without it "approved by" never renders.
  it("selects latestOpinionatedReviews, not reviews", () => {
    expect(SEARCH_MERGED_PRS_QUERY).toMatch(/\blatestOpinionatedReviews\b/);
    // `reviews` would populate participants and add a second reviewer list to merged rows.
    expect(SEARCH_MERGED_PRS_QUERY).not.toMatch(/\breviews\(/);
  });
});

describe("comment counts", () => {
  /** The text of `field(...) { ... }` in `query`, braces balanced. */
  const block = (query: string, field: string) => {
    const start = query.indexOf(`${field}(`);
    expect(start).toBeGreaterThanOrEqual(0);
    let depth = 0;
    for (let i = query.indexOf("{", start); i < query.length; i++) {
      if (query[i] === "{") depth++;
      else if (query[i] === "}" && --depth === 0) return query.slice(start, i + 1);
    }
    throw new Error(`unbalanced ${field}`);
  };

  // mapGraphQLPr totals totalCounts and reads createdAt + author for unread counts;
  // __typename catches app bots (no "[bot]" suffix in GraphQL logins).
  it.each([
    ["REVIEW_SEARCH_QUERY", REVIEW_SEARCH_QUERY],
    ["SEARCH_MY_PRS_QUERY", SEARCH_MY_PRS_QUERY],
  ])("%s selects totals, times and authors of comments and thread comments", (_name, query) => {
    for (const field of ["comments", "reviewThreads"]) {
      const sel = block(query, field);
      expect(sel).toMatch(/\btotalCount\b/);
      expect(sel).toMatch(/\bcreatedAt\b/);
      expect(sel).toMatch(/author \{ __typename login \}/);
    }
  });

  // A thread count above the fetched threads flags counts as incomplete.
  it.each([
    ["REVIEW_SEARCH_QUERY", REVIEW_SEARCH_QUERY],
    ["SEARCH_MY_PRS_QUERY", SEARCH_MY_PRS_QUERY],
  ])("%s selects the total thread count", (_name, query) => {
    expect(query).toMatch(/reviewThreads\(last: \d+\) \{\s*totalCount\b/);
  });

  it("keeps the review search's threads light", () => {
    // The review plates are latency-sensitive; they need no thread state.
    const threads = block(REVIEW_SEARCH_QUERY, "reviewThreads");
    expect(threads).not.toMatch(/\bisResolved\b/);
    expect(threads).toMatch(/reviewThreads\(last: 30\)/);
    expect(threads).toMatch(/comments\(last: 2\)/);
  });
});
