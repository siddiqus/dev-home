/**
 * PR-flow metrics: open/merged counts, avg time-to-first-review, avg age,
 * failing checks, and PR<->Jira linkage counts. Pure — `now` is a parameter.
 *
 * STUB: implement metrics with TDD per spec §5.
 */
import { extractTicketKey } from "../teamAggregation";
import type { RawPR } from "../teamAggregation";
import type { EnrichedIssue, PrFlow } from "./types";

export function computePrFlow(prs: RawPR[], issues: EnrichedIssue[], _now: Date): PrFlow {
  // TODO(BE-prflow): open/merged; avgFirstReviewH from first_review_at-created_at;
  // avgAgeDays; failingChecks (checks_status FAILURE); noJira (no ticket key);
  // jiraNoPR (in-progress issues with no linked PR).
  const open = prs.filter((p) => p.state === "open").length;
  const merged = prs.filter((p) => p.state === "merged" || !!p.merged_at).length;
  const noJira = prs.filter((p) => !extractTicketKey(p.title)).length;
  return {
    open,
    merged,
    avgFirstReviewH: null,
    avgAgeDays: 0,
    failingChecks: 0,
    noJira,
    jiraNoPR: issues.filter((i) => i.statusCategory === "indeterminate" && i.linkedPRs.length === 0).length,
  };
}
