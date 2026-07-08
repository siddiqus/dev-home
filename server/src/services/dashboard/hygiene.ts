/**
 * Delivery hygiene: PR<->Jira linkage problems.
 *  - prNoJira:     PRs with no parseable Jira key
 *  - jiraNoPR:     in-progress issues with no linked PR
 *  - mergedNotDone: issues with a merged PR but not in a done status
 *  - doneNoMerged: done issues that have linked PRs but none merged
 * Pure.
 *
 * STUB: implement with TDD per spec §5/§6.
 */
import { extractTicketKey, prSource } from "../teamAggregation";
import type { RawPR } from "../teamAggregation";
import type { EnrichedIssue, Hygiene, Ref } from "./types";

export function computeHygiene(
  issues: EnrichedIssue[],
  prs: RawPR[],
  _sprintKeys: Set<string>,
): Hygiene {
  const prRef = (p: RawPR): Ref => ({ kind: "pr", repo: p.repo_full_name, number: p.number });
  const issueRef = (i: EnrichedIssue): Ref => ({ kind: "issue", key: i.key });

  // prNoJira: PRs with no parseable Jira key
  const prNoJira = prs.filter((p) => !extractTicketKey(prSource(p))).map(prRef);

  // jiraNoPR: in-progress issues with no linked PR
  const jiraNoPR = issues
    .filter((i) => i.statusCategory === "indeterminate" && i.linkedPRs.length === 0)
    .map(issueRef);

  // mergedNotDone: issues with a merged PR but not in done status
  const mergedNotDone = issues
    .filter((i) => {
      if (i.statusCategory === "done") return false;
      return i.linkedPRs.some((pr) => pr.mergedAt);
    })
    .map(issueRef);

  // doneNoMerged: done issues that have linked PRs but none merged. We require at
  // least one linked PR because the PR fetch is a 2-week window — "done with zero
  // linked PRs" is dominated by tickets whose PR merged outside the window (noise).
  const doneNoMerged = issues
    .filter((i) => {
      if (i.statusCategory !== "done") return false;
      if (i.linkedPRs.length === 0) return false;
      return !i.linkedPRs.some((pr) => pr.mergedAt);
    })
    .map(issueRef);

  return {
    prNoJira,
    jiraNoPR,
    mergedNotDone,
    doneNoMerged,
  };
}
