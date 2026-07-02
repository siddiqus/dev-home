/**
 * Server-side contract for the sprint cockpit. Mirrors the frontend types in
 * `src/types/teams.ts` — the boundary between them is JSON, so the two are kept
 * in sync by hand. Aggregation modules import from here.
 */

export type RiskLevel = "normal" | "attention" | "high";

export interface RiskResult {
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface IssueFlags {
  unassigned: boolean;
  noEpic: boolean;
  stale: boolean;
  addedAfterStart: boolean;
  dueSoon: boolean;
  prFailingCI: boolean;
  prWaitingReview: boolean;
  inProgressNoPR: boolean;
}

export type Ref = { kind: "issue"; key: string } | { kind: "pr"; repo: string; number: number };

/** A PR as attached to an issue (mapped from RawPR, with cockpit enrichment). */
export interface LinkedPR {
  number: number;
  title: string;
  repo_full_name: string;
  html_url: string;
  state: string;
  checks_status: string | null;
  author: string;
  createdAt: string | null;
  mergedAt: string | null;
  reviewState: string | null;
  waitingReview: boolean;
}

/** Fully enriched issue = the frontend DashboardIssue shape. */
export interface EnrichedIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  assigneeAccountId: string | null;
  assigneeName: string | null;
  epicKey: string | null;
  epicName: string | null;
  linkedPRs: LinkedPR[];
  createdAt: string | null;
  updatedAt: string | null;
  dueDate: string | null;
  storyPoints: number | null;
  ageDays: number;
  daysSinceUpdate: number;
  flags: IssueFlags;
  risk: RiskResult;
}

/** Minimal sprint info the aggregators need. */
export interface SprintInfo {
  id: number;
  startDate: string | null;
  endDate: string | null;
}

export interface SprintPace {
  dayOfSprint: number;
  sprintLength: number;
  elapsedPct: number;
  totalCount: number;
  doneCount: number;
  remainingCount: number;
  donePct: number;
  behindPace: boolean;
  committedSP?: number;
  doneSP?: number;
}

export interface ScopeChange {
  addedCount: number;
  addedSP?: number;
}

export interface NeedsAttention {
  stale: Ref[];
  waitingReview: Ref[];
  failingCI: Ref[];
  noLinkedPR: Ref[];
  offBoard: Ref[];
  scopeCreep: Ref[];
  unassigned: Ref[];
  noEpic: Ref[];
}

export interface LoadBalance {
  max: number;
  min: number;
  imbalance: number;
}

export interface WorkloadEntry {
  accountId: string;
  displayName: string;
  githubUsername: string;
  ticketCount: number;
  prCount: number;
  byStatus: { new: number; indeterminate: number; inReview: number; done: number };
  wip: number;
  doneCount: number;
  stalledCount: number;
  avgDaysSinceUpdate: number;
  stalest: Ref | null;
  prOpen: number;
  prReviewing: number;
  prMerged: number;
  riskLevel: RiskLevel;
  sp?: number;
  doneSP?: number;
}

export interface PrFlow {
  open: number;
  merged: number;
  avgFirstReviewH: number | null;
  avgAgeDays: number;
  failingChecks: number;
  noJira: number;
  jiraNoPR: number;
}

export interface Hygiene {
  prNoJira: Ref[];
  jiraNoPR: Ref[];
  mergedNotDone: Ref[];
  doneNoMerged: Ref[];
}

export interface BurnupPoint {
  date: string;
  doneCount: number;
  totalCount: number;
  ideal: number;
}

export interface Burnup {
  trackingSince: string | null;
  points: BurnupPoint[];
}

export type InsightSeverity = "info" | "warn" | "critical";

export interface Insight {
  key: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
}
