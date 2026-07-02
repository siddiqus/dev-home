/**
 * Load distribution: per-member ticket/WIP/stalled/done + PR counts, plus a
 * team imbalance indicator. Supersedes the old computeWorkload.
 * Pure — `now` is a parameter.
 *
 * STUB: implement per-member rollups + balance with TDD per spec §5.
 */
import { classifyStatus } from "../teamAggregation";
import type { RawPR, RosterEntry } from "../teamAggregation";
import type { EnrichedIssue, LoadBalance, WorkloadEntry } from "./types";

function emptyByStatus() {
  return { new: 0, indeterminate: 0, inReview: 0, done: 0 };
}

export function computeLoadDistribution(
  roster: RosterEntry[],
  issues: EnrichedIssue[],
  prs: RawPR[],
  _now: Date,
): WorkloadEntry[] {
  // TODO(BE-load): compute wip, doneCount, stalledCount (flags.stale),
  // avgDaysSinceUpdate + stalest ref, prOpen/prReviewing/prMerged, riskLevel.
  return roster.map((r) => {
    const memberIssues = issues.filter((i) => i.assigneeAccountId === r.accountId);
    const byStatus = emptyByStatus();
    for (const i of memberIssues) byStatus[classifyStatus(i)] += 1;
    const prCount = prs.filter(
      (p) => p.author.toLowerCase() === r.githubUsername.toLowerCase(),
    ).length;
    return {
      accountId: r.accountId,
      displayName: r.displayName,
      githubUsername: r.githubUsername,
      ticketCount: memberIssues.length,
      prCount,
      byStatus,
      wip: 0,
      doneCount: byStatus.done,
      stalledCount: 0,
      avgDaysSinceUpdate: 0,
      stalest: null,
      prOpen: 0,
      prReviewing: 0,
      prMerged: 0,
      riskLevel: "normal",
    };
  });
}

export function computeLoadBalance(workload: WorkloadEntry[]): LoadBalance {
  // TODO(BE-load): spread of ticketCount across members.
  if (workload.length === 0) return { max: 0, min: 0, imbalance: 0 };
  const counts = workload.map((w) => w.ticketCount);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  return { max, min, imbalance: max - min };
}
