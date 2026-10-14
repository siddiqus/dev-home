import type { GitHubPR, JiraIssue } from "../../types";
import type { BadgeVariant } from "../../components/primitives/Badge";
import { ticketKeyOf } from "../../utils/tickets";
import { projectOfKey } from "../../../shared/tickets";
import { statusCategoryOf } from "../workday/buildWorkday";
import { repoRef, reviewingState, titleWithoutKey } from "../workday/prState";
import { prPin, ticketPin } from "../workday/pins";
import type { TicketRef } from "../workday/types";
import { headline, mySignals, prPriority, reviewSignals, PRIORITY } from "./signals";
import type { DeckData, DeckInputs, DeckPR, DeckTicket } from "./types";

/** Persisted deck state, minus the version (useDeckState owns storage). Spec §6.3. */
export interface DeckState {
  /** Ticket id → monotonic sequence number from when the tab first appeared. */
  arrival: Record<string, number>;
  /** Ordered current ids: "pr:<url>" or "ticket:<KEY>". */
  current: string[];
  /** Ticket ids in the order they entered ▶ Current. */
  currentTickets: string[];
  /** PR url → `updated_at` as of my last look. */
  seen: Record<string, string>;
  /** Ticket id → closed-at time. */
  closed: Record<string, string>;
  selected: string | null;
  seeded: boolean;
}

export const EMPTY_DECK_STATE: DeckState = {
  arrival: {},
  current: [],
  currentTickets: [],
  seen: {},
  closed: {},
  selected: null,
  seeded: false,
};

/** The patch useDeckState applies after a build; buildDeck never mutates state. */
export interface DeckStateUpdates {
  /** New entries only. */
  arrival?: Record<string, number>;
  /** Ticket ids to delete from `closed`. */
  reopen?: string[];
  /** Current ids whose PR (or ticket) left the deck. */
  dropCurrent?: string[];
  /** First-run seeding. */
  seen?: Record<string, string>;
  seeded?: true;
}

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

/** A collected PR before signals: mine, or one I review (requested or re-review). */
interface Collected {
  pr: GitHubPR;
  mine: boolean;
  requested: boolean;
}

/**
 * Spec §6.2 step 1: my PRs, review requests, and reviewing PRs that qualify for
 * re-review, de-duplicated by `html_url` with mine winning (then requested).
 */
function collectPRs(inp: DeckInputs): Collected[] {
  const byUrl = new Map<string, Collected>();
  const add = (pr: GitHubPR, mine: boolean, requested: boolean) => {
    if (!byUrl.has(pr.html_url)) byUrl.set(pr.html_url, { pr, mine, requested });
  };
  for (const pr of inp.openPRs) add(pr, true, false);
  for (const pr of inp.reviewRequests) add(pr, false, true);
  for (const pr of inp.reviewingPRs) {
    if (reviewingState(pr, false) === "new-commits") add(pr, false, false);
  }
  return [...byUrl.values()];
}

/** Signals and priority for one PR; seen-related fields are filled by later steps. */
function deckPR(c: Collected, current: Set<string>, now: Date): DeckPR {
  const signals = c.mine ? mySignals(c.pr, now) : reviewSignals(c.pr, c.requested);
  return {
    pr: c.pr,
    mine: c.mine,
    signals,
    priority: prPriority(signals),
    unseenComment: null,
    note: null,
    current: current.has(prPin(c.pr)),
    unseen: false,
  };
}

/** "Needs me" order (spec §5.5): priority, then unseen activity, then newest. */
function byNeedsMe(a: DeckPR, b: DeckPR): number {
  return (
    a.priority - b.priority ||
    Number(b.unseen) - Number(a.unseen) ||
    time(b.pr.updated_at) - time(a.pr.updated_at)
  );
}

/** Card order (spec §5.4): current PRs first, then needs-me order. */
function byCardOrder(a: DeckPR, b: DeckPR): number {
  return Number(b.current) - Number(a.current) || byNeedsMe(a, b);
}

const toneOf = (priority: number): BadgeVariant =>
  (Object.keys(PRIORITY) as BadgeVariant[]).find((t) => PRIORITY[t] === priority) ?? "neutral";

/** Rail status line: the PR that needs me most and its headline, or "No PR yet". */
function statusLine(prs: DeckPR[], newComments = 0): string {
  if (prs.length === 0) return "No PR yet";
  const top = [...prs].sort(byNeedsMe)[0];
  const line = [`#${top.pr.number}`, headline(top.signals)].filter(Boolean).join(" ");
  return newComments > 0 ? `${line} · ${newComments} new comments` : line;
}

/** Ticket-level fields derived from its PRs (spec §6.2 step 4). */
function deckTicket(
  id: string,
  key: string | null,
  ticket: TicketRef | null,
  prs: DeckPR[],
  current: Set<string>,
): DeckTicket {
  const sorted = [...prs].sort(byCardOrder);
  const first = sorted[0]?.pr;
  const title = ticket?.summary
    ? ticket.summary
    : key
      ? titleWithoutKey(first?.title ?? "", key)
      : first
        ? `${repoRef(first)} ${first.title}`
        : "";
  const worst = sorted.length > 0 ? Math.min(...sorted.map((p) => p.priority)) : PRIORITY.neutral;
  return {
    id,
    key,
    title,
    ticket,
    prs: sorted,
    stripe: toneOf(worst),
    status: statusLine(sorted),
    reviewOnly: sorted.length > 0 && sorted.every((p) => !p.mine),
    unseen: false,
    current: sorted.some((p) => p.current) || (key !== null && current.has(ticketPin(key))),
    jiraMention: null,
  };
}

/** When a ticket arrived, for numbering new tabs: its oldest PR, else the Jira ticket's creation. */
function arrivalTime(t: DeckTicket, issue: JiraIssue | undefined): number {
  if (t.prs.length > 0) return Math.min(...t.prs.map((p) => time(p.pr.created_at)));
  return time(issue?.created);
}

/** Sequence numbers for ids not yet in `arrival`, continuing from max+1 in arrival-time order. */
function newArrivals(
  tickets: DeckTicket[],
  arrival: Record<string, number>,
  issueOf: (key: string | null) => JiraIssue | undefined,
): Record<string, number> {
  const fresh = tickets
    .filter((t) => !(t.id in arrival))
    .map((t) => ({ id: t.id, at: arrivalTime(t, issueOf(t.key)) }))
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const known = Object.values(arrival);
  let next = known.length > 0 ? Math.max(...known) + 1 : 0;
  const out: Record<string, number> = {};
  for (const { id } of fresh) out[id] = next++;
  return out;
}

/** Compose the ticket deck from dashboard data and personal state. Spec §6.2. */
export function buildDeck(
  inp: DeckInputs,
  state: DeckState,
  now: Date,
): DeckData & { stateUpdates: DeckStateUpdates } {
  const current = new Set(state.current);

  const issues = new Map<string, JiraIssue>();
  for (const i of [...inp.assignedIssues, ...inp.allIssues]) issues.set(i.key.toUpperCase(), i);
  const issueOf = (key: string | null) => (key ? issues.get(key.toUpperCase()) : undefined);
  const ref = (key: string): TicketRef => {
    const issue = issueOf(key);
    return {
      key,
      summary: issue?.summary ?? "",
      statusName: issue?.status?.name ?? null,
      updated: issue?.updated ?? null,
      // Off-sprint needs v1's sprint extras, which the deck doesn't receive.
      offSprint: false,
    };
  };

  // Step 2: group by ticket key; ticketless PRs become singleton tabs.
  const byKey = new Map<string, DeckPR[]>();
  const tickets: DeckTicket[] = [];
  for (const c of collectPRs(inp)) {
    const p = deckPR(c, current, now);
    const key = ticketKeyOf(c.pr)?.toUpperCase() ?? null;
    if (!key) {
      tickets.push(deckTicket(prPin(c.pr), null, null, [p], current));
      continue;
    }
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  for (const [key, prs] of byKey) tickets.push(deckTicket(key, key, ref(key), prs, current));

  // Step 3: in-progress tickets assigned to me with no PR (v1's workingOn rule).
  for (const issue of inp.assignedIssues) {
    const key = issue.key.toUpperCase();
    if (statusCategoryOf(issue) === "indeterminate" && !byKey.has(key)) {
      byKey.set(key, []);
      tickets.push(deckTicket(key, key, ref(key), [], current));
    }
  }

  // Arrival order (spec §8 phase 1: everything is Open for now).
  const added = newArrivals(tickets, state.arrival, issueOf);
  const arrival = { ...state.arrival, ...added };
  const open = [...tickets].sort((a, b) => arrival[a.id] - arrival[b.id]);

  const stateUpdates: DeckStateUpdates = {};
  if (Object.keys(added).length > 0) stateUpdates.arrival = added;

  return {
    current: [],
    open,
    closed: [],
    unmatched: [],
    counts: {
      tickets: tickets.length,
      current: tickets.filter((t) => t.current).length,
      unseen: 0,
    },
    stateUpdates,
  };
}

/** A ticket key for the rail: just the number when every keyed ticket shares one project. */
export function shortKey(key: string, deck: DeckTicket[]): string {
  const projects = new Set(
    deck.flatMap((t) => (t.key ? [projectOfKey(t.key)] : [])).concat(projectOfKey(key)),
  );
  return projects.size === 1 ? key.slice(key.lastIndexOf("-") + 1) : key;
}
