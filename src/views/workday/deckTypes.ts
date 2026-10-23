import type { GitHubPR, GitHubComment, JiraIssue, JiraComment, Note } from "../../types";
import type { BadgeVariant } from "../../components/primitives/Badge";
import type { TicketRef, MentionItem } from "./types";

/** A signal chip: a label with a tone. */
export interface Signal {
  label: string;
  tone: BadgeVariant;
  detail?: string;
  /** Where the chip's step gets done; the chip renders as a link to it. */
  href?: string;
}

/** Inputs to buildDeck, from the same data the Workday page receives. */
export interface DeckInputs {
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  reviewingPRs: GitHubPR[];
  assignedIssues: JiraIssue[];
  allIssues: JiraIssue[];
  githubMentions: GitHubComment[];
  jiraMentions: JiraComment[];
  notes: Note[];
  /** Upper-cased keys flagged off-sprint (from buildWorkday's TicketRefs). */
  offSprintKeys?: Set<string>;
  /** My merged PRs; those merged in the last day make the Merged recently group. */
  mergedPRs?: GitHubPR[];
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
  /** Tone of the status line's headline signal, so the rail reads by urgency. */
  statusTone: BadgeVariant;
  reviewOnly: boolean;
  unseen: boolean;
  current: boolean;
  jiraMention: MentionItem | null;
  /** Newest unresolved `jira_ticket` note on a PR-less ticket. */
  note: Note | null;
  /** Unresolved #todo notes on the ticket or its PRs, newest first. */
  todos: Note[];
  /** A #todo note with nothing on the deck to attach to: the tab is the note itself. */
  noteItem: Note | null;
}

/** The composed deck, split into groups. */
export interface DeckData {
  current: DeckTicket[];
  /** Tickets with a PR of mine merged in the last day, newest first; read-only tabs. */
  merged: DeckTicket[];
  open: DeckTicket[];
  closed: DeckTicket[];
  unmatched: MentionItem[];
  counts: { tickets: number; current: number; unseen: number };
}
