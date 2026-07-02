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

  // avgFirstReviewH: mean hours from created_at to first_review_at for PRs that have it
  const prsWithReview = prs.filter((p) => p.first_review_at);
  let avgFirstReviewH: number | null = null;
  if (prsWithReview.length > 0) {
    const totalHours = prsWithReview.reduce((sum, p) => {
      const created = new Date(p.created_at).getTime();
      const reviewed = new Date(p.first_review_at!).getTime();
      const hours = (reviewed - created) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);
    avgFirstReviewH = Math.round((totalHours / prsWithReview.length) * 10) / 10;
  }

  // avgAgeDays: mean age in days for open PRs only
  const openPRs = prs.filter((p) => p.state === "open");
  let avgAgeDays = 0;
  if (openPRs.length > 0) {
    const totalDays = openPRs.reduce((sum, p) => {
      const created = new Date(p.created_at).getTime();
      const days = (now.getTime() - created) / (1000 * 60 * 60 * 24);
      return sum + days;
    }, 0);
    avgAgeDays = Math.round((totalDays / openPRs.length) * 10) / 10;
  }

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
