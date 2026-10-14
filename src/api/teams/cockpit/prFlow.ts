/**
 * PR-flow metrics: open/merged counts, avg time-to-first-review, avg age,
 * failing checks, and PR<->Jira linkage counts. Pure — `now` is a parameter.
 *
 * STUB: implement metrics with TDD per spec §5.
 */
import { extractTicketKey, prSource } from "../aggregation";
import type { RawPR } from "../aggregation";
import type { EnrichedIssue, PrFlow } from "./types";

export function computePrFlow(prs: RawPR[], issues: EnrichedIssue[], now: Date): PrFlow {
  const open = prs.filter((p) => p.state === "open").length;
  const merged = prs.filter((p) => p.state === "merged" || !!p.merged_at).length;
  const noJira = prs.filter((p) => !extractTicketKey(prSource(p))).length;
  const jiraNoPR = issues.filter(
    (i) => i.statusCategory === "indeterminate" && i.linkedPRs.length === 0,
  ).length;

  // medianFirstReviewH: median hours from ready-for-review to the first human
  // review. PRs without ready_at predate the field, so fall back to created_at;
  // a null ready_at means it never left draft. A review left on the draft
  // counts as 0h. Median, so one PR that sat for a week doesn't swamp the rest.
  const reviewHours = prs
    .map((p) => {
      const start = p.ready_at === undefined ? p.created_at : p.ready_at;
      if (!p.first_review_at || !start) return null;
      const ready = new Date(start).getTime();
      const reviewed = new Date(p.first_review_at).getTime();
      if (isNaN(ready) || isNaN(reviewed)) return null;
      return Math.max(0, reviewed - ready) / (1000 * 60 * 60);
    })
    .filter((h): h is number => h !== null)
    .sort((a, b) => a - b);
  const mid = Math.floor(reviewHours.length / 2);
  const medianFirstReviewH =
    reviewHours.length === 0
      ? null
      : Math.round(
          (reviewHours.length % 2
            ? reviewHours[mid]
            : (reviewHours[mid - 1] + reviewHours[mid]) / 2) * 10,
        ) / 10;

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
    medianFirstReviewH,
    firstReviewSample: reviewHours.length,
    avgAgeDays,
    failingChecks,
    noJira,
    jiraNoPR,
  };
}
