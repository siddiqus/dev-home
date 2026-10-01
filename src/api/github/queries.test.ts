import { describe, it, expect } from "vitest";
import {
  REVIEWS_QUERY,
  SEARCH_MY_PRS_QUERY,
  SEARCH_ORG_PRS_QUERY,
  SINGLE_PR_QUERY,
} from "./queries";

describe("open-PR queries", () => {
  // mapGraphQLPr derives has_conflict from `mergeable`; a query that omits it
  // silently hides the "Merge conflict" chip on that page.
  it.each([
    ["REVIEWS_QUERY", REVIEWS_QUERY],
    ["SEARCH_MY_PRS_QUERY", SEARCH_MY_PRS_QUERY],
    ["SEARCH_ORG_PRS_QUERY", SEARCH_ORG_PRS_QUERY],
    ["SINGLE_PR_QUERY", SINGLE_PR_QUERY],
  ])("%s selects mergeable", (_name, query) => {
    expect(query).toMatch(/\bmergeable\b/);
  });
});
