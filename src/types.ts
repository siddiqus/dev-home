// JIRA Types
export type StatusCategoryKey = "new" | "indeterminate" | "done";

export interface JiraIssue {
  key: string;
  summary: string;
  status: {
    name: string;
    statusCategory: {
      /** Jira's category; absent on issues cached before this field was mapped. */
      key?: StatusCategoryKey;
      colorName: string;
    };
  };
  priority: {
    name: string;
    iconUrl: string;
  };
  assignee: {
    displayName: string;
    avatarUrls: {
      "48x48": string;
    };
  };
  reporter?: {
    displayName: string;
    avatarUrls: {
      "48x48": string;
    };
  } | null;
  project: {
    key: string;
    name: string;
  };
  created: string;
  updated: string;
  /** Users in Jira's "Code Reviewers" field; empty when none are set. */
  codeReviewers: {
    displayName: string;
    avatarUrls: {
      "48x48": string;
    };
  }[];
  /**
   * Full issue description (ADF converted to markdown). Only populated by the
   * bulk endpoint; the assigned-issues list and filter search omit it and it is
   * lazy-loaded on demand when a single issue's drawer/modal is opened.
   */
  description?: string;
  issueType?: {
    name: string | null;
    iconUrl: string | null;
  };
}

export interface JiraComment {
  id: string;
  author: {
    displayName: string;
    avatarUrls: {
      "48x48": string;
    };
  };
  body: {
    text: string;
  };
  created: string;
  updated: string;
  issueKey: string;
  issueSummary: string;
}

/** An assigned ticket in an open sprint (Workday sprint membership). */
export interface SprintTicket {
  key: string;
  summary: string;
  status: { name: string; categoryKey: StatusCategoryKey };
  /** Name of the active (else first open) sprint the ticket is in. */
  sprintName: string | null;
  points: number | null;
  flagged: boolean;
}

/** An assigned, unresolved ticket outside every open sprint. */
export interface OffSprintTicket extends JiraIssue {
  flagged: boolean;
}

/** A ticket whose status the current user changed since a point in time. */
export interface DoneTicket {
  key: string;
  summary: string;
  toStatus: string;
  changedAt: string;
}

// GitHub Types
export interface CheckRunInfo {
  name: string;
  status: string;
  url: string | null;
  /** ISO timestamps from GitHub CheckRuns; absent for legacy StatusContexts. */
  started_at?: string | null;
  completed_at?: string | null;
}

export interface GitHubLabel {
  name: string;
  /** 6-char hex color from GitHub, without a leading "#". */
  color: string;
}

export interface GitHubPR {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft: boolean;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
    /** Display name, when the author is a user who has set one. */
    name?: string;
  };
  head: {
    ref: string;
    /** Head commit when the list loaded (open-PR queries only); merges pin to it. */
    sha?: string;
  };
  base: {
    ref: string;
  };
  /** Markdown description. Undefined when the source query didn't fetch it
      (list queries don't) — usePRBody lazy-loads it for modals. */
  body?: string;
  /** Lines added across the PR diff (GraphQL `additions`). Null when unavailable. */
  additions?: number | null;
  /** Lines removed across the PR diff (GraphQL `deletions`). Null when unavailable. */
  deletions?: number | null;
  /** Number of files touched by the PR (GraphQL `changedFiles`). Null when unavailable. */
  changed_files?: number | null;
  repo_full_name: string;
  checks_status: string | null;
  /**
   * Failing checks that aren't required by branch protection, so they don't
   * affect checks_status. Non-empty → the icon renders an amber warning.
   */
  optional_checks_failing?: string[];
  checks: CheckRunInfo[];
  review_status: string | null;
  merged_at?: string;
  /** GitHub login of whoever merged the PR. Populated for merged variants only. */
  merged_by?: string | null;
  /** Logins whose latest decisive review approved the PR. Populated for merged variants only. */
  approved_by?: string[];
  in_merge_queue?: boolean;
  /** Newest non-bot discussion activity is from someone else — the viewer's turn. */
  your_turn?: boolean;
  /** Number of unresolved review threads on the PR. */
  unresolved_thread_count?: number;
  /** GitHub reports the branch as CONFLICTING against its base. */
  has_conflict?: boolean;
  /** GitHub's aggregate review decision: APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, or null. */
  review_decision?: string | null;
  labels?: GitHubLabel[];
  /** Review requests only: the viewer has already reviewed or commented on this PR. */
  viewer_engaged?: boolean;
  /**
   * Review plate only: the viewer's latest submitted review. PENDING and
   * DISMISSED reviews don't count; null when no review counts.
   */
  viewer_review_state?: ReviewState | null;
  /** Review plate only: when `viewer_review_state`'s review was submitted. */
  viewer_reviewed_at?: string | null;
  /** Review plate only: the head commit is newer than `viewer_reviewed_at` (false without a review). */
  new_commits_since_review?: boolean;
  /** Pending review requests (user logins / team names). Undefined when the query didn't fetch them. */
  requested_reviewers?: string[];
  /**
   * People (not the author, not bots) who reviewed or commented, first-seen
   * order, each with their standing review state. Undefined when the query
   * fetched neither reviews nor comments.
   */
  participants?: PRParticipant[];
}

/** Someone who reviewed or commented on a PR. */
export interface PRParticipant {
  login: string;
  /** Their latest APPROVED / CHANGES_REQUESTED stands; otherwise COMMENTED. */
  state: ReviewState;
}

/** A review the viewer submitted. */
export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED";

/** Someone else's PR the viewer reviewed, with their latest review in the window. */
export interface ReviewedPR {
  pr: GitHubPR;
  state: ReviewState;
  submittedAt: string;
}

export interface GitHubComment {
  id: number;
  html_url: string;
  body: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  pr_number: number;
  repo_full_name: string;
  context_title: string;
  reason: string;
}

export type GitHubReviewRequest = GitHubPR;

// Dashboard Data
export interface DashboardData {
  jiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  openPRs: GitHubPR[];
  reviewRequests: GitHubReviewRequest[];
  loading: boolean;
  error: string | null;
}

// Note Types
export type NoteType = "free_text" | "jira_ticket" | "github_pr" | "link" | "standup";

export interface Note {
  id: number;
  type: NoteType;
  title: string;
  content: string;
  reference_id: string | null;
  resolved: number;
  pinned: number;
  /** ISO-8601 UTC datetime the reminder should fire, or null for a plain note. */
  remind_at: string | null;
  created_at: string;
  updated_at: string;
}

// Kanban Types
export type KanbanColumnId = "todo" | "in_progress" | "on_hold" | "in_review" | "done";

export type KanbanItemType = "note" | "pr" | "review";

export interface KanbanItem {
  id: number;
  item_type: KanbanItemType;
  item_id: string;
  column_name: KanbanColumnId;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface KanbanTile {
  kanbanItem: KanbanItem;
  note?: Note;
  pr?: GitHubPR;
  review?: GitHubReviewRequest;
  title: string;
  subtitle: string;
  url: string;
  sourceBadge: string;
  sourceBadgeVariant: "info" | "success" | "warning" | "danger" | "purple" | "neutral";
  checksStatus?: string | null;
  optionalChecksFailing?: string[];
  timestamp: string;
}

// ---------------- Pomodoro ----------------

export type PomodoroPhase = "idle" | "work" | "shortBreak" | "longBreak";
export type PomodoroWorkMinutes = 15 | 20 | 30 | 45;

export interface PomodoroTaskSnapshot {
  itemId: string;
  group?: FocusableGroup;
  title: string;
  sourceBadge: string;
  sourceBadgeVariant: "info" | "success" | "warning" | "danger" | "purple" | "neutral";
  url: string;
}

export type FocusableGroup = "prs" | "reviews" | "jira" | "mentions" | "notes";

export interface FocusableItem {
  id: string;
  group: FocusableGroup;
  title: string;
  sourceBadge: string;
  sourceBadgeVariant: "info" | "success" | "warning" | "danger" | "purple" | "neutral";
  url: string;
}

export interface PomodoroPersistedState {
  phase: PomodoroPhase;
  cycleCount: number;
  endsAt: number | null;
  remainingMs: number;
  isRunning: boolean;
  workMinutes: PomodoroWorkMinutes;
  selectedTaskSnapshot: PomodoroTaskSnapshot | null;
}
