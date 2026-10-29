/**
 * Build the Needs-Attention panel: the few signals worth acting on today —
 * stale tickets and PRs waiting on a first review.
 * The lesser linkage signals live in Delivery Hygiene (hygiene.ts).
 */
import type { EnrichedIssue, NeedsAttention, Ref } from "./types";

export function buildNeedsAttention(issues: EnrichedIssue[]): NeedsAttention {
  const issueRef = (key: string): Ref => ({ kind: "issue", key });

  const stale: Ref[] = [];
  const waitingReview: Ref[] = [];

  // A PR can reference several sprint tickets; list it once.
  const seenWaitingReview = new Set<string>();

  for (const issue of issues) {
    if (issue.flags.stale) stale.push(issueRef(issue.key));

    for (const pr of issue.linkedPRs) {
      const prKey = `${pr.repo_full_name}:${pr.number}`;
      if (pr.waitingReview && !seenWaitingReview.has(prKey)) {
        waitingReview.push({ kind: "pr", repo: pr.repo_full_name, number: pr.number });
        seenWaitingReview.add(prKey);
      }
    }
  }

  return { stale, waitingReview };
}
