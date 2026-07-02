/**
 * PR-flow metrics: open/merged counts, avg time-to-first-review, avg age,
 * failing checks, and PR<->Jira linkage counts. Pure — `now` is a parameter.
 *
 * STUB: implement metrics with TDD per spec §5.
 */
import { extractTicketKey } from "../teamAggregation";
import type { RawPR } from "../teamAggregation";
import type { EnrichedIssue, PrFlow } from "./types";

export function computePrFlow(prs: RawPR[], issues: EnrichedIssue[], now: Date): PrFlow {
  const open = prs.filter((p) => p.state === "open").length;
  const merged = prs.filter((p) => p.state === "merged" || !!p.merged_at).length;
  const noJira = prs.filter((p) => !extractTicketKey(p.title)).length;
  const jiraNoPR = issues.filter(
    (i) => i.statusCategory === "indeterminate" && i.linkedPRs.length === 0,
  ).length;

  // avgFirstReviewH: mean hours from created_at to first_review_at (valid dates only)
  const reviewHours = prs
    .map((p) => {
      if (!p.first_review_at) return null;
      const created = new Date(p.created_at).getTime();
      const reviewed = new Date(p.first_review_at).getTime();
      if (isNaN(created) || isNaN(reviewed)) return null;
      return (reviewed - created) / (1000 * 60 * 60);
    })
    .filter((h): h is number => h !== null);
  const avgFirstReviewH =
    reviewHours.length > 0
      ? Math.round((reviewHours.reduce((a, b) => a + b, 0) / reviewHours.length) * 10) / 10
      : null;

  // avgAgeDays: mean age in days for open PRs (valid created_at only)
  const openAges = prs
    .filter((p) => p.state === "open")
    .map((p) => {
      const created = new Date(p.created_at).getTime();
      if (isNaN(created)) return null;
      return (now.getTime() - created) / (1000 * 60 * 60 * 24);
    })
    .filter((d): d is number => d !== null);
  const avgAgeDays =
    openAges.length > 0
      ? Math.round((openAges.reduce((a, b) => a + b, 0) / openAges.length) * 10) / 10
      : 0;

  // failingChecks: open PRs with checks_status === 'FAILURE'
  const failingChecks = prs.filter(
    (p) => p.state === "open" && p.checks_status === "FAILURE",
  ).length;

  return {
    open,
    merged,
    avgFirstReviewH,
    avgAgeDays,
    failingChecks,
    noJira,
    jiraNoPR,
  };
}
