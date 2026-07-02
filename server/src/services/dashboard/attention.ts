/**
 * Build the Needs-Attention panel: collect Refs for each signal from the
 * already-enriched issues plus the off-board PRs.
 *
 * STUB: wire each bucket from issue.flags. Implement with TDD per spec §5/§6.
 */
import type { EnrichedIssue, NeedsAttention, Ref } from "./types";

export interface OffBoardPRRef {
  repo_full_name: string;
  number: number;
}

export function buildNeedsAttention(
  issues: EnrichedIssue[],
  offBoardPRs: OffBoardPRRef[],
): NeedsAttention {
  const issueRef = (key: string): Ref => ({ kind: "issue", key });
  const prRef = (repo: string, number: number): Ref => ({ kind: "pr", repo, number });

  const stale: Ref[] = [];
  const waitingReview: Ref[] = [];
  const failingCI: Ref[] = [];
  const noLinkedPR: Ref[] = [];
  const scopeCreep: Ref[] = [];
  const unassigned: Ref[] = [];
  const noEpic: Ref[] = [];

  // Dedupe PRs by repo+number
  const seenWaitingReview = new Set<string>();
  const seenFailingCI = new Set<string>();

  for (const issue of issues) {
    if (issue.flags.stale) {
      stale.push(issueRef(issue.key));
    }
    if (issue.flags.inProgressNoPR) {
      noLinkedPR.push(issueRef(issue.key));
    }
    if (issue.flags.addedAfterStart) {
      scopeCreep.push(issueRef(issue.key));
    }
    if (issue.flags.unassigned) {
      unassigned.push(issueRef(issue.key));
    }
    if (issue.flags.noEpic) {
      noEpic.push(issueRef(issue.key));
    }

    // Extract PR refs with deduplication
    for (const pr of issue.linkedPRs) {
      const prKey = `${pr.repo_full_name}:${pr.number}`;
      if (pr.waitingReview && !seenWaitingReview.has(prKey)) {
        waitingReview.push(prRef(pr.repo_full_name, pr.number));
        seenWaitingReview.add(prKey);
      }
      if (pr.checks_status === "FAILURE" && !seenFailingCI.has(prKey)) {
        failingCI.push(prRef(pr.repo_full_name, pr.number));
        seenFailingCI.add(prKey);
      }
    }
  }

  const offBoard = offBoardPRs.map((p) => prRef(p.repo_full_name, p.number));

  return {
    stale,
    waitingReview,
    failingCI,
    noLinkedPR,
    offBoard,
    scopeCreep,
    unassigned,
    noEpic,
  };
}
