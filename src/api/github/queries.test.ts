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
