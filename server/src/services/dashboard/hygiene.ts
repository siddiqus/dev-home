/**
 * Delivery hygiene: PR<->Jira linkage problems.
 *  - prNoJira:     PRs with no parseable Jira key
 *  - jiraNoPR:     in-progress issues with no linked PR
 *  - mergedNotDone: issues with a merged PR but not in a done status
 *  - doneNoMerged: done issues with no merged PR
 * Pure.
 *
 * STUB: implement with TDD per spec §5/§6.
 */
import { extractTicketKey } from "../teamAggregation";
import type { RawPR } from "../teamAggregation";
import type { EnrichedIssue, Hygiene, Ref } from "./types";

export function computeHygiene(
  issues: EnrichedIssue[],
  prs: RawPR[],
  sprintKeys: Set<string>,
): Hygiene {
  // TODO(BE-prflow): implement the four buckets.
  const prRef = (p: RawPR): Ref => ({ kind: "pr", repo: p.repo_full_name, number: p.number });
  const prNoJira = prs.filter((p) => !extractTicketKey(p.title)).map(prRef);
  void issues;
  void sprintKeys;
  return {
    prNoJira,
    jiraNoPR: [],
    mergedNotDone: [],
    doneNoMerged: [],
  };
}
