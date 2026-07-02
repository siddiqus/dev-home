/**
 * Per-issue enrichment: age/staleness, boolean signal flags, and risk score.
 * Pure — takes `now` as a parameter so it is deterministic and testable.
 *
 * STUB: returns a well-formed but naive enrichment. Implement flags + scoring
 * per docs/superpowers/specs/2026-07-02-sprint-cockpit-design.md (§5) with TDD.
 */
import { extractTicketKey } from "../teamAggregation";
import type { RawPR, RawIssue } from "../teamAggregation";
import type { EnrichedIssue, LinkedPR, SprintInfo } from "./types";
import { type CockpitConfig, riskLevelFor } from "./config";

/** Group PRs by the Jira key parsed from their title. */
export function groupPRsByTicket(prs: RawPR[]): Map<string, RawPR[]> {
  const byKey = new Map<string, RawPR[]>();
  for (const pr of prs) {
    const key = extractTicketKey(pr.title);
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push(pr);
    byKey.set(key, list);
  }
  return byKey;
}

function mapLinkedPR(pr: RawPR): LinkedPR {
  return {
    number: pr.number,
    title: pr.title,
    repo_full_name: pr.repo_full_name,
    html_url: pr.html_url,
    state: pr.state,
    checks_status: pr.checks_status,
    author: pr.author,
    createdAt: pr.created_at ?? null,
    mergedAt: pr.merged_at ?? null,
    reviewState: pr.review_state ?? null,
    waitingReview: false,
  };
}

/**
 * Enrich a single issue with its linked PRs, age/staleness, flags, and risk.
 * @param issue        raw Jira issue
 * @param linkedRawPRs the RawPRs whose title references this issue's key
 */
export function enrichIssue(
  issue: RawIssue,
  linkedRawPRs: RawPR[],
  _sprint: SprintInfo | null,
  _now: Date,
  _config: CockpitConfig,
): EnrichedIssue {
  // TODO(BE-risk): compute ageDays/daysSinceUpdate from createdAt/updatedAt vs now;
  // compute flags (unassigned, noEpic, stale, addedAfterStart, dueSoon,
  // prFailingCI, prWaitingReview, inProgressNoPR); score risk via RISK_WEIGHTS.
  const flags = {
    unassigned: !issue.assigneeAccountId,
    noEpic: !issue.epicKey,
    stale: false,
    addedAfterStart: false,
    dueSoon: false,
    prFailingCI: false,
    prWaitingReview: false,
    inProgressNoPR: false,
  };
  return {
    key: issue.key,
    summary: issue.summary,
    status: issue.status,
    statusCategory: issue.statusCategory,
    assigneeAccountId: issue.assigneeAccountId,
    assigneeName: issue.assigneeName,
    epicKey: issue.epicKey,
    epicName: issue.epicName,
    linkedPRs: linkedRawPRs.map(mapLinkedPR),
    createdAt: issue.createdAt ?? null,
    updatedAt: issue.updatedAt ?? null,
    dueDate: issue.dueDate ?? null,
    storyPoints: issue.storyPoints ?? null,
    ageDays: 0,
    daysSinceUpdate: 0,
    flags,
    risk: { score: 0, level: riskLevelFor(0), reasons: [] },
  };
}
