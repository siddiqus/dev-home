// Backend Configuration
export interface BackendConfig {
  configured: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
}

// JIRA Types
export interface JiraIssue {
  key: string;
  summary: string;
  status: {
    name: string;
    statusCategory: {
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
  project: {
    key: string;
    name: string;
  };
  updated: string;
  self: string;
  description: string;
  fields: Record<string, any>;
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
  self: string;
  issueKey: string;
  issueSummary: string;
}

// GitHub Types
export interface CheckRunInfo {
  name: string;
  status: string;
  url: string | null;
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
  };
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
  body: string;
  repository_url: string;
  repo_full_name: string;
  checks_status: string | null;
  checks: CheckRunInfo[];
  review_status: string | null;
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
  issue_url: string;
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

// View Type
export type ViewType = "dashboard" | "settings";

// Note Types
export type NoteType = "free_text" | "jira_ticket" | "github_pr" | "link";

export interface Note {
  id: number;
  type: NoteType;
  title: string;
  content: string;
  reference_id: string | null;
  resolved: number;
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
  timestamp: string;
}

// ---------------- Pomodoro ----------------

export type PomodoroPhase = "idle" | "work" | "shortBreak" | "longBreak";
export type PomodoroWorkMinutes = 15 | 20 | 30 | 45;

export interface PomodoroTaskSnapshot {
  itemId: string;
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
