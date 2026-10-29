/**
 * Delivery hygiene: the lesser signals worth a periodic sweep.
 *  - failingCI:     linked PRs whose checks fail
 *  - unassigned:    open issues nobody has picked up
 *  - jiraNoPR:      in-progress issues with no linked PR
 *  - prNoJira:      PRs with no parseable Jira key
 *  - mergedNotDone: issues with a merged PR but not in a done status
 *  - doneNoMerged:  done issues that have linked PRs but none merged
 *  - noEpic:        open issues outside any epic
 *  - addedMidSprint: issues created after the sprint started
 * Pure.
 */
import { extractTicketKey, prSource } from "../aggregation";
import type { RawPR } from "../aggregation";
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

  // failingCI: a PR can reference several sprint tickets; list it once.
  const seenFailing = new Set<string>();
  const failingCI: Ref[] = [];
  for (const issue of issues) {
    for (const pr of issue.linkedPRs) {
      const prKey = `${pr.repo_full_name}:${pr.number}`;
      if (pr.checks_status !== "FAILURE" || seenFailing.has(prKey)) continue;
      seenFailing.add(prKey);
      failingCI.push({ kind: "pr", repo: pr.repo_full_name, number: pr.number });
    }
  }

  const unassigned = issues.filter((i) => i.flags.unassigned).map(issueRef);
  const noEpic = issues.filter((i) => i.flags.noEpic).map(issueRef);
  const addedMidSprint = issues.filter((i) => i.flags.addedAfterStart).map(issueRef);

  return {
    failingCI,
    unassigned,
    jiraNoPR,
    prNoJira,
    mergedNotDone,
    doneNoMerged,
    noEpic,
    addedMidSprint,
  };
}
