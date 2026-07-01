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
}

export interface LinkedPR {
  number: number;
  title: string;
  repo_full_name: string;
  html_url: string;
  state: string;
  checks_status: string | null;
  author: string;
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
}

export interface DashboardEpic {
  key: string | null;
  name: string;
  total: number;
  done: number;
  issueKeys: string[];
}

export interface WorkloadEntry {
  accountId: string;
  displayName: string;
  githubUsername: string;
  ticketCount: number;
  prCount: number;
  byStatus: { new: number; indeterminate: number; done: number };
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

export interface TeamDashboard {
  team: { id: number; name: string; board: { id: number; name: string } | null };
  sprint: SprintResult | null;
  sprints: SprintResult[];
  epics: DashboardEpic[];
  issues: DashboardIssue[];
  workload: WorkloadEntry[];
  offBoardPRs: OffBoardPR[];
  counts: { sprintIssues: number; epics: number; offBoardPRs: number };
  errors: string[];
}
