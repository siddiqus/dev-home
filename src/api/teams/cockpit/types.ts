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
}

export interface NeedsAttention {
  stale: Ref[];
  waitingReview: Ref[];
}

export interface LoadBalance {
  max: number;
  min: number;
  imbalance: number;
}

/** An issue assigned to a member that carries a non-normal risk level, with the raw reason flags. */
export interface AtRiskIssue {
  key: string;
  summary: string;
  level: RiskLevel; // only "attention" | "high" are included
  reasons: string[]; // raw flag keys, e.g. "stale", "prFailingCI", "dueSoon"
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
  /** The member's assigned issues whose risk level is not normal, worst first. Explains the risk pill. */
  atRiskIssues: AtRiskIssue[];
}

export interface Hygiene {
  failingCI: Ref[];
  unassigned: Ref[];
  jiraNoPR: Ref[];
  prNoJira: Ref[];
  mergedNotDone: Ref[];
  doneNoMerged: Ref[];
  noEpic: Ref[];
  addedMidSprint: Ref[];
}

/**
 * needsReviewer: nobody asked to review · waitingReview: reviewers' move
 * (first review or re-review) · readyToMerge: approved, author to merge ·
 * withAuthor: changes requested or reviewed, author's move · draft.
 */
export type ReviewQueueState =
  | "needsReviewer"
  | "waitingReview"
  | "readyToMerge"
  | "withAuthor"
  | "draft";

/** One row of the Review Queue: an open PR and whose court the ball is in. */
export interface ReviewQueueEntry {
  number: number;
  repo_full_name: string;
  title: string;
  html_url: string;
  author: string;
  /** Whose move it is, and what for. */
  state: ReviewQueueState;
  reason: string;
  /** Persons who reviewed (most recent first), then persons with an open request. */
  reviewers: string[];
  checks_status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** When the ball moved to whoever holds it now. */
  waitingSince: string | null;
}
