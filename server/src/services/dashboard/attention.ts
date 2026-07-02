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
  // TODO(BE-risk): populate each bucket from issue.flags; offBoard from args.
  const issueRef = (key: string): Ref => ({ kind: "issue", key });
  const empty: NeedsAttention = {
    stale: [],
    waitingReview: [],
    failingCI: [],
    noLinkedPR: [],
    offBoard: offBoardPRs.map((p) => ({ kind: "pr", repo: p.repo_full_name, number: p.number })),
    scopeCreep: [],
    unassigned: [],
    noEpic: [],
  };
  void issues;
  void issueRef;
  return empty;
}
