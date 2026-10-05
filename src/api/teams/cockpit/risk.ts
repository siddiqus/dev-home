/**
 * Per-issue enrichment: age/staleness, boolean signal flags, and risk score.
 * Pure — takes `now` as a parameter so it is deterministic and testable.
 *
 * STUB: returns a well-formed but naive enrichment. Implement flags + scoring
 * per docs/superpowers/specs/2026-07-02-sprint-cockpit-design.md (§5) with TDD.
 */
import { extractTicketKey, prSource } from "../aggregation";
import type { RawPR, RawIssue } from "../aggregation";
import type { EnrichedIssue, LinkedPR, SprintInfo } from "./types";
import { type CockpitConfig, RISK_WEIGHTS, riskLevelFor } from "./config";

/** Group PRs by the Jira key parsed from their title. */
export function groupPRsByTicket(prs: RawPR[]): Map<string, RawPR[]> {
  const byKey = new Map<string, RawPR[]>();
  for (const pr of prs) {
    const key = extractTicketKey(prSource(pr));
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push(pr);
    byKey.set(key, list);
  }
  return byKey;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Weekdays elapsed from `from` to `to`, counting each full day that lands Mon–Fri. */
export function businessDaysBetween(from: Date, to: Date): number {
  let days = 0;
  for (let t = from.getTime() + DAY_MS; t <= to.getTime(); t += DAY_MS) {
    const day = new Date(t).getDay();
    if (day !== 0 && day !== 6) days++;
  }
  return days;
}

/** Jira due dates are plain "YYYY-MM-DD" calendar days — read them in local time, not UTC. */
export function parseDueDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
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
    ? Math.max(0, Math.floor((now.getTime() - new Date(issue.createdAt).getTime()) / DAY_MS))
    : 0;
  const daysSinceUpdate = issue.updatedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(issue.updatedAt).getTime()) / DAY_MS))
    : 0;

  // Map linked PRs with waitingReview computation
  const linkedPRs = linkedRawPRs.map((pr) => mapLinkedPR(pr, now, config));

  // Flags. Finished work carries no delivery risk, so done issues only keep
  // the scope signal (addedAfterStart).
  const open = issue.statusCategory !== "done";
  const unassigned = open && !issue.assigneeAccountId;
  const noEpic = open && !issue.epicKey;
  // Weekends don't count toward staleness.
  const stale =
    issue.statusCategory === "indeterminate" &&
    !!issue.updatedAt &&
    businessDaysBetween(new Date(issue.updatedAt), now) > config.staleDays;
  const addedAfterStart =
    !!issue.createdAt &&
    !!sprint?.startDate &&
    new Date(issue.createdAt) > new Date(sprint.startDate);
  const dueSoon =
    open && issue.dueDate
      ? parseDueDate(issue.dueDate).getTime() <= now.getTime() + config.dueSoonDays * DAY_MS
      : false;
  const prFailingCI = open && linkedPRs.some((pr) => pr.checks_status === "FAILURE");
  const prWaitingReview = open && linkedPRs.some((pr) => pr.waitingReview);
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
