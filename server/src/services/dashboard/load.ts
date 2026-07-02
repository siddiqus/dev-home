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
  // Check if any issue has non-null storyPoints to determine if we should include SP fields
  const hasSP = issues.some((i) => i.storyPoints !== null);

  return roster.map((r) => {
    const memberIssues = issues.filter((i) => i.assigneeAccountId === r.accountId);
    const memberPRs = prs.filter((p) => p.author.toLowerCase() === r.githubUsername.toLowerCase());

    // Status breakdown
    const byStatus = emptyByStatus();
    for (const i of memberIssues) byStatus[classifyStatus(i)] += 1;

    // WIP = indeterminate + inReview
    const wip = byStatus.indeterminate + byStatus.inReview;
    const doneCount = byStatus.done;

    // Stalled count (flags.stale)
    const stalledCount = memberIssues.filter((i) => i.flags.stale).length;

    // avgDaysSinceUpdate and stalest: only for in-progress issues (statusCategory === 'indeterminate')
    const inProgressIssues = memberIssues.filter((i) => i.statusCategory === "indeterminate");
    let avgDaysSinceUpdate = 0;
    let stalest = null;
    if (inProgressIssues.length > 0) {
      const sum = inProgressIssues.reduce((acc, i) => acc + i.daysSinceUpdate, 0);
      avgDaysSinceUpdate = Math.round((sum / inProgressIssues.length) * 10) / 10;
      const stalestIssue = inProgressIssues.reduce((max, i) =>
        i.daysSinceUpdate > max.daysSinceUpdate ? i : max,
      );
      stalest = { kind: "issue" as const, key: stalestIssue.key };
    }

    // PR counts
    const prCount = memberPRs.length;
    const prOpen = memberPRs.filter((p) => p.state === "open").length;
    const prMerged = memberPRs.filter((p) => p.state === "merged" || p.merged_at).length;
    const prReviewing = memberPRs.filter(
      (p) => p.state === "open" && (p.review_requested || p.review_state === "REVIEW_REQUIRED"),
    ).length;

    // Risk level: max of member issues' risk.level (high > attention > normal)
    const riskLevels: ("normal" | "attention" | "high")[] = ["normal", "attention", "high"];
    let riskLevel: "normal" | "attention" | "high" = "normal";
    for (const issue of memberIssues) {
      if (riskLevels.indexOf(issue.risk.level) > riskLevels.indexOf(riskLevel)) {
        riskLevel = issue.risk.level;
      }
    }

    // Optional SP fields
    const entry: WorkloadEntry = {
      accountId: r.accountId,
      displayName: r.displayName,
      githubUsername: r.githubUsername,
      ticketCount: memberIssues.length,
      prCount,
      byStatus,
      wip,
      doneCount,
      stalledCount,
      avgDaysSinceUpdate,
      stalest,
      prOpen,
      prReviewing,
      prMerged,
      riskLevel,
    };

    if (hasSP) {
      const sp = memberIssues.reduce((acc, i) => acc + (i.storyPoints || 0), 0);
      const doneSP = memberIssues
        .filter((i) => i.statusCategory === "done")
        .reduce((acc, i) => acc + (i.storyPoints || 0), 0);
      entry.sp = sp;
      entry.doneSP = doneSP;
    }

    return entry;
  });
}

export function computeLoadBalance(workload: WorkloadEntry[]): LoadBalance {
  if (workload.length === 0) return { max: 0, min: 0, imbalance: 0 };
  const counts = workload.map((w) => w.ticketCount);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  return { max, min, imbalance: max - min };
}
