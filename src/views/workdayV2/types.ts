import type { GitHubPR, GitHubComment, JiraIssue, JiraComment, Note } from "../../types";
import type { BadgeVariant } from "../../components/primitives/Badge";
import type { TicketRef, MentionItem } from "../workday/types";

/** A signal chip: a label with a tone. */
export interface Signal {
  label: string;
  tone: BadgeVariant;
  detail?: string;
}

/** Inputs to buildDeck, from the same data WorkdayView already receives. */
export interface DeckInputs {
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  reviewingPRs: GitHubPR[];
  assignedIssues: JiraIssue[];
  allIssues: JiraIssue[];
  githubMentions: GitHubComment[];
  jiraMentions: JiraComment[];
  notes: Note[];
  /** Upper-cased keys v1 flags off-sprint (from buildWorkday's TicketRefs). */
  offSprintKeys?: Set<string>;
}

/** A PR on the deck with its signals and context. */
export interface DeckPR {
  pr: GitHubPR;
  mine: boolean;
  signals: Signal[];
  priority: number;
  unseenComment: MentionItem | null;
  note: Note | null;
  current: boolean;
  unseen: boolean;
}

/** A ticket tab on the deck. */
export interface DeckTicket {
  id: string;
  key: string | null;
  title: string;
  ticket: TicketRef | null;
  prs: DeckPR[];
  stripe: BadgeVariant;
  status: string;
  reviewOnly: boolean;
  unseen: boolean;
  current: boolean;
  jiraMention: MentionItem | null;
  /** Newest unresolved `jira_ticket` note on a PR-less ticket. */
  note: Note | null;
}

/** The composed deck, split into groups. */
export interface DeckData {
  current: DeckTicket[];
  open: DeckTicket[];
  closed: DeckTicket[];
  unmatched: MentionItem[];
  counts: { tickets: number; current: number; unseen: number };
}
