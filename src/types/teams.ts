export interface TeamMember {
  id: number;
  team_id: number;
  display_name: string;
  jira_account_id: string;
  jira_email: string | null;
  github_username: string;
}

export interface Team {
  id: number;
  name: string;
  jira_board_id: number | null;
  jira_board_name: string | null;
  member_count?: number;
}

export interface JiraUserResult {
  accountId: string;
  displayName: string;
  emailAddress: string | null;
  avatarUrl: string;
}

export interface JiraBoardResult {
  id: number;
  name: string;
  projectKey: string;
  projectName: string;
}

export interface SprintResult {
  id: number;
  name: string;
  state: "active" | "closed" | "future";
  startDate?: string;
  endDate?: string;
  goal?: string;
}

export interface LinkedPR {
  number: number;
  title: string;
  repo_full_name: string;
  html_url: string;
  state: string;
  checks_status: string | null;
  author: string;
  // --- cockpit enrichment (optional; populated by the backend) ---
  createdAt?: string | null;
  mergedAt?: string | null;
  /** Rollup of PR reviews: APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | COMMENTED | null */
  reviewState?: string | null;
  /** True when the PR is open and has been waiting for a first review > threshold. */
  waitingReview?: boolean;
}

// ---------------------------------------------------------------------------
// Cockpit shared primitives
// ---------------------------------------------------------------------------

/** Lightweight pointer used in drill-down arrays so panels don't duplicate objects. */
export type Ref = { kind: "issue"; key: string } | { kind: "pr"; repo: string; number: number };

export type RiskLevel = "normal" | "attention" | "high";

export interface RiskResult {
  score: number;
  level: RiskLevel;
  reasons: string[];
}

/** Per-issue boolean signals used by the Needs-Attention panel and risk scoring. */
export interface IssueFlags {
  unassigned: boolean;
  noEpic: boolean;
  /** In-progress and no movement (updated) for > staleDays. */
  stale: boolean;
  /** Created after the sprint start date. */
  addedAfterStart: boolean;
  dueSoon: boolean;
  prFailingCI: boolean;
  prWaitingReview: boolean;
  inProgressNoPR: boolean;
}

export interface DashboardIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  assigneeAccountId: string | null;
  assigneeName: string | null;
  epicKey: string | null;
  epicName: string | null;
  linkedPRs: LinkedPR[];
  // --- cockpit enrichment ---
  createdAt: string | null;
  updatedAt: string | null;
  dueDate: string | null;
  storyPoints: number | null;
  ageDays: number;
  daysSinceUpdate: number;
  flags: IssueFlags;
  risk: RiskResult;
}

export interface DashboardEpic {
  key: string | null;
  name: string;
  total: number;
  done: number;
  /** Count of stalled (stuck) issues in this epic — drives the risk chip. */
  stalled: number;
  issueKeys: string[];
}

export interface WorkloadEntry {
  accountId: string;
  displayName: string;
  githubUsername: string;
  ticketCount: number;
  prCount: number;
  byStatus: { new: number; indeterminate: number; inReview: number; done: number };
  // --- cockpit: load distribution ---
  /** Work in progress = tickets in the indeterminate/in-review buckets. */
  wip: number;
  doneCount: number;
  stalledCount: number;
  /** Average days-since-update across this member's in-progress tickets. */
  avgDaysSinceUpdate: number;
  /** The member's stalest in-progress ticket, if any. */
  stalest: Ref | null;
  prOpen: number;
  prReviewing: number;
  prMerged: number;
  riskLevel: RiskLevel;
  /** Optional story-point rollups (secondary). */
  sp?: number;
  doneSP?: number;
}

export interface OffBoardPR {
  number: number;
  title: string;
  repo_full_name: string;
  html_url: string;
  author: string;
  state: string;
  ticketKey: string | null;
  ticketProject: string | null;
}

// ---------------------------------------------------------------------------
// Cockpit sprint-level aggregates
// ---------------------------------------------------------------------------

/** Completion measured against elapsed time — TICKET-COUNT based (SP optional). */
export interface SprintPace {
  dayOfSprint: number;
  sprintLength: number;
  /** 0..1 fraction of the sprint window elapsed. */
  elapsedPct: number;
  totalCount: number;
  doneCount: number;
  remainingCount: number;
  /** 0..1 fraction of tickets done. */
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
  /** max - min ticket spread across assignees; 0 when perfectly even. */
  imbalance: number;
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
  /** ISO date of the first snapshot for this sprint, or null when none yet. */
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

export interface TeamDashboard {
  team: { id: number; name: string; board: { id: number; name: string } | null };
  sprint: SprintResult | null;
  sprints: SprintResult[];
  epics: DashboardEpic[];
  issues: DashboardIssue[];
  workload: WorkloadEntry[];
  progress: { total: number; new: number; indeterminate: number; inReview: number; done: number };
  offBoardPRs: OffBoardPR[];
  counts: { sprintIssues: number; epics: number; offBoardPRs: number };
  // --- cockpit aggregates ---
  pace: SprintPace;
  scope: ScopeChange;
  needsAttention: NeedsAttention;
  loadBalance: LoadBalance;
  prFlow: PrFlow;
  hygiene: Hygiene;
  burnup: Burnup;
  insights: Insight[];
  /** ISO timestamp of when the backend assembled this payload. */
  syncedAt?: string;
  errors: string[];
}
