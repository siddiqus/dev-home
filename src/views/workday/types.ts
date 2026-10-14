import type { GitHubComment, GitHubPR, JiraComment, JiraIssue, ReviewState } from "../../types";
import type { BadgeVariant } from "../../components/primitives/Badge";
import type { StateBadge } from "./prState";
import type { WorkdayExtras } from "../../services/workday";

export interface WorkdayInputs {
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  reviewingPRs: GitHubPR[];
  /** Tickets assigned to me (useDashboard's assignedJiraIssues). */
  assignedIssues: JiraIssue[];
  /** Assigned ∪ PR-referenced tickets (useDashboard's jiraIssues), for summaries. */
  allIssues: JiraIssue[];
  extras: WorkdayExtras;
}

export interface TicketRef {
  key: string;
  summary: string;
  statusName: string | null;
  offSprint: boolean;
  /** Jira's last-updated time, when the issue was fetched. */
  updated: string | null;
}

/** A ticket with my PRs under it; `prs` empty → "No PR yet"; `ticket` null → "No ticket". */
export interface TicketGroup {
  ticket: TicketRef | null;
  prs: GitHubPR[];
}

export type DoneItem =
  | { kind: "merged"; pr: GitHubPR; ticket: TicketRef | null; at: string }
  | { kind: "reviewed"; pr: GitHubPR; ticket: TicketRef | null; state: ReviewState; at: string }
  | { kind: "status"; ticket: TicketRef; toStatus: string; at: string };

export type BlockerItem =
  | { kind: "pr"; pr: GitHubPR; ticket: TicketRef | null; reasons: string[] }
  | { kind: "flagged"; ticket: TicketRef };

export type WaitingItem =
  | {
      kind: "awaiting-review";
      pr: GitHubPR;
      ticket: TicketRef | null;
      reviewers: string[];
      since: string;
    }
  | { kind: "your-move"; pr: GitHubPR; ticket: TicketRef | null }
  | { kind: "code-review"; ticket: TicketRef; reviewers: string[] };

export interface NotStartedItem {
  ticket: TicketRef;
  sprintName: string | null;
  points: number | null;
  updated: string | null;
}

export interface Section<T> {
  items: T[];
  loading: boolean;
  error: string | null;
}

export interface WorkdaySections {
  done: Section<DoneItem>;
  workingOn: Section<TicketGroup>;
  reviewing: Section<TicketGroup>;
  /** html_urls of reviewing PRs where my review is (re-)requested. */
  reviewRequestedUrls: Set<string>;
  blockers: Section<BlockerItem>;
  waiting: Section<WaitingItem>;
  notStarted: Section<NotStartedItem> & { offSprintItems: NotStartedItem[] };
  /** Distinct off-sprint ticket keys shown anywhere on the page. */
  offSprintCount: number;
}

/* ---------- Focus mode ---------- */

export type NeedsTier = "self" | "others" | "ship";

/** Needs-you tiers in display order: approved PRs first, since merging is the quickest win. */
export const NEEDS_TIER_ORDER: NeedsTier[] = ["ship", "self", "others"];

/** One thing a PR needs: a coloured verb plus one short fact. */
export interface NeedsIssue {
  verb: string;
  tone: BadgeVariant;
  /** One short fact, e.g. "lint + unit failing" or "abu re-requested". */
  reason: string;
}

/** One "needs you" line: a coloured verb (a label, not a button) for one PR. */
export interface NeedsItem extends NeedsIssue {
  tier: NeedsTier;
  pr: GitHubPR;
  ticketKey: string | null;
  /** Every issue, worst first; the verb, tone and reason are the first one's. */
  issues: NeedsIssue[];
  at: string;
}

export interface MentionItem {
  id: string;
  source: "GitHub" | "Jira";
  who: string;
  ticketKey: string | null;
  /** "repo#12" or the Jira key. */
  where: string;
  snippet: string;
  at: string;
  url: string;
}

/** A Working-on line: a ticket with its PRs, or (ticket null) one ticketless PR. */
export interface WorkingItem {
  ticket: TicketRef | null;
  prs: GitHubPR[];
  state: StateBadge;
  at: string | null;
}

export interface WaitingOnReviewer {
  pr: GitHubPR;
  ticketKey: string | null;
  reviewers: string[];
  since: string;
}

/** A PR I reviewed where nothing is pending on me. */
export interface WaitingOnAuthor {
  pr: GitHubPR;
  ticketKey: string | null;
  state: ReviewState | null;
  at: string | null;
}

/** A PR row with its Focus badge (my PR's state, or where my review stands). */
export interface PinnedPR {
  pr: GitHubPR;
  badge: StateBadge;
  /** My own PR (vs one I review). */
  mine: boolean;
}

/** A pinned ticket (with every open PR under it) or a lone pinned PR. */
export type PinnedItem =
  | { kind: "ticket"; key: string; ticket: TicketRef | null; prs: PinnedPR[] }
  | ({ kind: "pr"; ticketKey: string | null } & PinnedPR);

export interface FocusInputs {
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  reviewingPRs: GitHubPR[];
  /** buildWorkday's (unfiltered) Working-on groups. */
  workingOn: TicketGroup[];
  githubMentions: GitHubComment[];
  jiraMentions: JiraComment[];
}

export interface FocusData {
  /** Pinned items, most recently pinned first; they're left out of the other sections. */
  pinned: PinnedItem[];
  needs: NeedsItem[];
  mentions: MentionItem[];
  working: WorkingItem[];
  waiting: {
    onReviewers: WaitingOnReviewer[];
    onAuthor: WaitingOnAuthor[];
    approved: WaitingOnAuthor[];
  };
}
