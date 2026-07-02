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
import { type CockpitConfig, RISK_WEIGHTS, riskLevelFor } from "./config";

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

function mapLinkedPR(pr: RawPR, now: Date, config: CockpitConfig): LinkedPR {
  const createdAt = pr.created_at ? new Date(pr.created_at) : null;
  const hoursSinceCreation = createdAt
    ? (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
    : 0;
  const waitingReview =
    pr.state === "open" && !pr.first_review_at && hoursSinceCreation > config.waitingReviewHours;

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
    waitingReview,
  };
}

/**
 * Enrich a single issue with its linked PRs, age/staleness, flags, and risk.
 * @param issue        raw Jira issue
 * @param linkedRawPRs the RawPRs whose title references this issue's key
 * @param sprint       sprint info for addedAfterStart detection
 * @param now          current time for deterministic date math
 * @param config       cockpit thresholds
 */
export function enrichIssue(
  issue: RawIssue,
  linkedRawPRs: RawPR[],
  sprint: SprintInfo | null,
  now: Date,
  config: CockpitConfig,
): EnrichedIssue {
  // Age/staleness
  const ageDays = issue.createdAt
    ? Math.floor((now.getTime() - new Date(issue.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const daysSinceUpdate = issue.updatedAt
    ? Math.floor((now.getTime() - new Date(issue.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Map linked PRs with waitingReview computation
  const linkedPRs = linkedRawPRs.map((pr) => mapLinkedPR(pr, now, config));

  // Flags
  const unassigned = !issue.assigneeAccountId;
  const noEpic = !issue.epicKey;
  const stale = issue.statusCategory === "indeterminate" && daysSinceUpdate > config.staleDays;
  const addedAfterStart =
    !!issue.createdAt &&
    !!sprint?.startDate &&
    new Date(issue.createdAt) > new Date(sprint.startDate);
  const dueSoon = issue.dueDate
    ? new Date(issue.dueDate).getTime() <= now.getTime() + config.dueSoonDays * 24 * 60 * 60 * 1000
    : false;
  const prFailingCI = linkedPRs.some((pr) => pr.checks_status === "FAILURE");
  const prWaitingReview = linkedPRs.some((pr) => pr.waitingReview);
  const inProgressNoPR = issue.statusCategory === "indeterminate" && linkedPRs.length === 0;

  const flags = {
    unassigned,
    noEpic,
    stale,
    addedAfterStart,
    dueSoon,
    prFailingCI,
    prWaitingReview,
    inProgressNoPR,
  };

  // Risk scoring
  let score = 0;
  const reasons: string[] = [];
  type FlagKey = keyof typeof RISK_WEIGHTS;

  for (const [flag, isSet] of Object.entries(flags)) {
    if (isSet && flag in RISK_WEIGHTS) {
      score += RISK_WEIGHTS[flag as FlagKey];
      reasons.push(flag);
    }
  }

  return {
    key: issue.key,
    summary: issue.summary,
    status: issue.status,
    statusCategory: issue.statusCategory,
    assigneeAccountId: issue.assigneeAccountId,
    assigneeName: issue.assigneeName,
    epicKey: issue.epicKey,
    epicName: issue.epicName,
    linkedPRs,
    createdAt: issue.createdAt ?? null,
    updatedAt: issue.updatedAt ?? null,
    dueDate: issue.dueDate ?? null,
    storyPoints: issue.storyPoints ?? null,
    ageDays,
    daysSinceUpdate,
    flags,
    risk: { score, level: riskLevelFor(score), reasons },
  };
}
