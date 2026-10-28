import type { GitHubComment, GitHubPR, JiraComment, JiraIssue, Note } from "../../types";
import type { BadgeVariant } from "../../components/primitives/Badge";
import { ticketKeyOf } from "../../utils/tickets";
import { normalizeNoteRef, prNoteKey } from "../../utils/prNotes";
import { projectOfKey } from "../../../shared/tickets";
import { githubMentionItem, jiraMentionItem } from "./buildFocus";
import { statusCategoryOf } from "./buildWorkday";
import { repoRef, reviewingState, titleWithoutKey } from "./prState";
import { mergedTabId, notePin, prPin, ticketPin } from "./pins";
import { parseLink } from "./deckSearch";
import { hasTag, noteHeadline } from "../../utils/noteTags";
import { parseTimestamp } from "../../utils/time";
import { compactAge } from "./dates";
import type { MentionItem, TicketRef } from "./types";
import { headline, mySignals, prPriority, reviewSignals, PRIORITY } from "./signals";
import type { DeckData, DeckInputs, DeckPR, DeckTicket } from "./deckTypes";

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
  /** Ticket ids whose every current item is being dropped (spec §5.6). */
  dropCurrentTickets?: string[];
  /**
   * `ticket:<KEY>` pins whose ticket now has PRs, replaced in place by a pin on
   * the ticket's first card-order PR (`to`), or just removed (`to: null`) when
   * one of its PRs is already current. Keeps the ticket in ▶ Current and lets
   * Space on that PR un-pin it.
   */
  migrateCurrent?: { from: string; to: string | null; ticketId: string }[];
  /** First-run seeding. */
  seen?: Record<string, string>;
  seeded?: true;
}

// parseTimestamp: notes carry marker-less UTC ("YYYY-MM-DD HH:MM:SS"), which
// `new Date` would read as local time.
const time = (iso: string | null | undefined) => (iso ? parseTimestamp(iso).getTime() : 0);

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

/** Per-build lookups shared by the PR and ticket steps. */
interface BuildContext {
  current: Set<string>;
  /** Seen time (ms) for a `seen` id; +Infinity on the first run, so everything counts as seen. */
  seenAt: (id: string) => number;
  /** GitHub mentions per PR, keyed by `prRef`. */
  ghMentions: Map<string, GitHubComment[]>;
  /** Jira mentions per upper-cased ticket key. */
  jiraMentions: Map<string, JiraComment[]>;
  /** Unseen GitHub mention count per PR url, filled by deckPR for the status line. */
  newComments: Map<string, number>;
  /** Unresolved notes per PR, keyed by `prNoteKey` (spec §6.4). */
  prNotes: Map<string, Note[]>;
  /** Unresolved `jira_ticket` notes per upper-cased key. */
  ticketNotes: Map<string, Note[]>;
}

/** Matches a GitHub mention to its PR: repo and number. */
const prRef = (repo: string, number: number) => `${repo.toLowerCase()}#${number}`;

/** The newest of `items` by `at`, ties broken by id so the pick is input-order independent. */
function newest<T extends { id: string | number }>(items: T[], at: (item: T) => string): T | null {
  let best: T | null = null;
  for (const i of items) {
    const d = best ? time(at(i)) - time(at(best)) : 1;
    const later =
      typeof i.id === "number" && typeof best?.id === "number"
        ? i.id > best.id
        : String(i.id) > String(best?.id);
    if (d > 0 || (d === 0 && best && later)) best = i;
  }
  return best;
}

/** Signals, priority and seen state for one PR (spec §6.2 step 4, §5.8). */
function deckPR(c: Collected, ctx: BuildContext, now: Date): DeckPR {
  const signals = c.mine ? mySignals(c.pr, now) : reviewSignals(c.pr, c.requested);
  const seenAt = ctx.seenAt(c.pr.html_url);
  const comments = (ctx.ghMentions.get(prRef(c.pr.repo_full_name, c.pr.number)) ?? []).filter(
    (m) => time(m.created_at) > seenAt,
  );
  ctx.newComments.set(c.pr.html_url, comments.length);
  const comment = newest(comments, (m) => m.created_at);
  return {
    pr: c.pr,
    mine: c.mine,
    signals,
    priority: prPriority(signals),
    unseenComment: comment ? githubMentionItem(comment) : null,
    note: newest(ctx.prNotes.get(prNoteKey(c.pr)) ?? [], (n) => n.created_at),
    current: ctx.current.has(prPin(c.pr)),
    // A missing `seen` entry reads as 0, so a newly arrived PR starts unseen.
    unseen: time(c.pr.updated_at) > seenAt,
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

/**
 * Rail status line: the PR that needs me most and its headline, plus its unseen
 * GitHub comment count, toned by that headline; "No PR yet" for PR-less tickets.
 */
function statusLine(
  prs: DeckPR[],
  newComments: Map<string, number>,
): { text: string; tone: BadgeVariant } {
  if (prs.length === 0) return { text: "No PR yet", tone: "neutral" };
  const top = [...prs].sort(byNeedsMe)[0];
  const line = [`#${top.pr.number}`, headline(top.signals)].filter(Boolean).join(" ");
  const count = newComments.get(top.pr.html_url) ?? 0;
  return {
    text: count > 0 ? `${line} · ${count} new comment${count === 1 ? "" : "s"}` : line,
    tone: top.signals[0]?.tone ?? "neutral",
  };
}

/**
 * Ticket-level fields derived from its PRs (spec §6.2 step 4). `merged` PRs
 * (newest merge first) are listed after the open ones and only speak for the
 * ticket — title, status line, stripe — when it has none open.
 */
function deckTicket(
  id: string,
  key: string | null,
  ticket: TicketRef | null,
  prs: DeckPR[],
  ctx: BuildContext,
  merged: DeckPR[] = [],
): DeckTicket {
  const sorted = [...prs].sort(byCardOrder);
  const lead = sorted.length > 0 ? sorted : merged;
  const first = lead[0]?.pr;
  const title = ticket?.summary
    ? ticket.summary
    : key
      ? titleWithoutKey(first?.title ?? "", key)
      : first
        ? `${repoRef(first)} ${first.title}`
        : "";
  const status =
    sorted.length === 0 && merged.length > 0
      ? {
          text: `#${merged[0].pr.number} ${merged[0].signals[0].label}`,
          tone: merged[0].signals[0].tone,
        }
      : statusLine(sorted, ctx.newComments);
  const worst = lead.length > 0 ? Math.min(...lead.map((p) => p.priority)) : PRIORITY.neutral;
  // The ticket was last looked at when its most recently seen PR was, or when
  // markSeen wrote `ticket:<KEY>` (the only seen entry a PR-less ticket has).
  const ticketSeenAt = key
    ? Math.max(ctx.seenAt(ticketPin(key)), ...sorted.map((p) => ctx.seenAt(p.pr.html_url)))
    : 0;
  const mention = key
    ? newest(
        (ctx.jiraMentions.get(key) ?? []).filter((c) => time(c.created) > ticketSeenAt),
        (c) => c.created,
      )
    : null;
  return {
    id,
    key,
    title,
    ticket,
    prs: [...sorted, ...merged],
    stripe: toneOf(worst),
    status: status.text,
    statusTone: status.tone,
    reviewOnly: sorted.length > 0 && sorted.every((p) => !p.mine),
    // An unseen Jira mention counts as activity too, so `n` and the dot find it.
    unseen: sorted.some((p) => p.unseen) || mention !== null,
    current: sorted.some((p) => p.current) || (key !== null && ctx.current.has(ticketPin(key))),
    jiraMention: mention ? jiraMentionItem(mention) : null,
    note:
      key && sorted.length === 0
        ? newest(ctx.ticketNotes.get(key) ?? [], (n) => n.created_at)
        : null,
    todos: [],
    noteItem: null,
  };
}

/** The upper-cased Jira key a `jira_ticket` note points at: a bare key or a browse URL. */
function noteTicketKey(n: Note): string | null {
  if (n.type !== "jira_ticket" || !n.reference_id?.trim()) return null;
  const link = parseLink(n.reference_id);
  return link?.kind === "ticket" ? link.key : n.reference_id.trim().toUpperCase();
}

/** What a note points at, for the rail status line: "repo#12", the ticket key, the link, or "Note". */
export function noteTarget(n: Note): string {
  const prKey = normalizeNoteRef(n.reference_id);
  if (prKey) return prKey.slice(prKey.indexOf("/") + 1);
  return noteTicketKey(n) ?? ((n.type === "link" && n.reference_id?.trim()) || "Note");
}

/** A #todo note with nothing on the deck to attach to, as a tab of its own. */
function noteTab(n: Note, ctx: BuildContext): DeckTicket {
  return {
    id: notePin(n.id),
    key: null,
    title: noteHeadline(n),
    ticket: null,
    prs: [],
    stripe: "neutral",
    status: noteTarget(n),
    statusTone: "neutral",
    reviewOnly: false,
    unseen: false,
    current: ctx.current.has(notePin(n.id)),
    jiraMention: null,
    note: null,
    todos: [],
    noteItem: n,
  };
}

/** A merged PR of mine: read-only, never current or unseen, its one chip saying when it merged. */
function mergedDeckPR(pr: GitHubPR, ctx: BuildContext, now: Date): DeckPR {
  const age = compactAge(pr.merged_at!, now);
  const by = pr.merged_by ? ` by ${pr.merged_by}` : "";
  return {
    pr,
    mine: true,
    // Also the rail's status line, for the newest merge.
    signals: [
      { label: `Merged ${age === "now" ? "just now" : `${age} ago`}${by}`, tone: "purple" },
    ],
    priority: PRIORITY.purple,
    unseenComment: null,
    note: newest(ctx.prNotes.get(prNoteKey(pr)) ?? [], (n) => n.created_at),
    current: false,
    unseen: false,
  };
}

/** Newest merge first. */
const byMergedDesc = (a: GitHubPR, b: GitHubPR) => time(b.merged_at) - time(a.merged_at);

/** An open PR on the deck, as opposed to a merged one listed under its ticket. */
const isOpen = (p: DeckPR) => !p.pr.merged_at;

/** How far back the Merged recently group reaches. */
export const MERGED_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The Merged recently group: my PRs merged in the last day, grouped by ticket
 * like the rest of the deck, newest merge first. Read-only tabs: never seen-
 * tracked, current, closed or numbered, and they carry no mentions.
 */
function mergedTabs(
  prs: GitHubPR[],
  ctx: BuildContext,
  ref: (key: string) => TicketRef,
  now: Date,
): DeckTicket[] {
  const mergedAt = (pr: GitHubPR) => time(pr.merged_at);
  const recent = prs
    .filter((pr) => pr.merged_at && now.getTime() - mergedAt(pr) <= MERGED_WINDOW_MS)
    .sort(byMergedDesc);
  const byId = new Map<string, { key: string | null; prs: DeckPR[] }>();
  for (const pr of recent) {
    const key = ticketKeyOf(pr)?.toUpperCase() ?? null;
    const id = mergedTabId(key, pr);
    const tab = byId.get(id) ?? { key, prs: [] };
    tab.prs.push(mergedDeckPR(pr, ctx, now));
    byId.set(id, tab);
  }
  return [...byId].map(([id, { key, prs: tabPRs }]) => {
    const t = deckTicket(id, key, key ? ref(key) : null, [], ctx, tabPRs);
    // The rail names the newest merge and who approved it; on the card, the
    // approvers sit in the PR row's meta line instead of the chip.
    const [top] = tabPRs;
    return {
      ...t,
      approvers: top.pr.approved_by ?? [],
      unseen: false,
      current: false,
      jiraMention: null,
      note: null,
    };
  });
}

/** When a ticket arrived, for numbering new tabs: its oldest PR, else the Jira ticket's creation. */
function arrivalTime(t: DeckTicket, issue: JiraIssue | undefined): number {
  if (t.noteItem) return time(t.noteItem.created_at);
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

/**
 * Spec §5.9 auto-reopen for a closed ticket. "New activity" is any PR with
 * `updated_at > closedAt`. "A new PR or review request joins" is detected by
 * time, since GitHubPR carries no review-request timestamp: a PR created after
 * closedAt, or (for a request on an existing PR) its `updated_at`, which GitHub
 * bumps when a review is requested. We deliberately don't use "no seen entry"
 * to detect joins: it would misfire on PRs that were on the ticket at close
 * time but never looked at.
 */
function reopens(t: DeckTicket, closedAt: string): boolean {
  const at = time(closedAt);
  // A note tab: editing the note after closing it.
  if (t.noteItem) return time(t.noteItem.updated_at) > at;
  // Merged PRs don't count: a merge after closing isn't new work on the ticket.
  return t.prs.filter(isOpen).some((p) => time(p.pr.updated_at) > at || time(p.pr.created_at) > at);
}

/** Mentions not attached to any tab (closed tabs count as attached), newest first. */
function unmatchedMentions(
  inp: DeckInputs,
  prRefs: Set<string>,
  ticketIds: Set<string>,
): MentionItem[] {
  return [
    ...inp.githubMentions
      .filter((m) => !prRefs.has(prRef(m.repo_full_name, m.pr_number)))
      .map(githubMentionItem),
    ...inp.jiraMentions
      .filter((c) => !ticketIds.has(c.issueKey.toUpperCase()))
      .map(jiraMentionItem),
  ].sort((a, b) => time(b.at) - time(a.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Compose the ticket deck from dashboard data and personal state. Spec §6.2. */
export function buildDeck(
  inp: DeckInputs,
  state: DeckState,
  now: Date,
): DeckData & { stateUpdates: DeckStateUpdates } {
  // First run (spec §5.8): seed everything as seen so the deck starts calm.
  const seeding = !state.seeded;
  const ghMentions = new Map<string, GitHubComment[]>();
  for (const m of inp.githubMentions) {
    const k = prRef(m.repo_full_name, m.pr_number);
    ghMentions.set(k, [...(ghMentions.get(k) ?? []), m]);
  }
  const jiraMentions = new Map<string, JiraComment[]>();
  for (const c of inp.jiraMentions) {
    const k = c.issueKey.toUpperCase();
    jiraMentions.set(k, [...(jiraMentions.get(k) ?? []), c]);
  }
  const prNotes = new Map<string, Note[]>();
  const ticketNotes = new Map<string, Note[]>();
  const push = (m: Map<string, Note[]>, k: string, n: Note) => m.set(k, [...(m.get(k) ?? []), n]);
  // #todo notes go on the deck themselves (below), so they stay out of the 📝 lines.
  const todoNotes: Note[] = [];
  for (const n of inp.notes) {
    if (n.resolved !== 0) continue;
    if (hasTag(n, "todo")) {
      todoNotes.push(n);
      continue;
    }
    const prKey = normalizeNoteRef(n.reference_id);
    const ticketKey = noteTicketKey(n);
    if (prKey) push(prNotes, prKey, n);
    else if (ticketKey) push(ticketNotes, ticketKey, n);
  }
  const ctx: BuildContext = {
    current: new Set(state.current),
    seenAt: (id) => (seeding ? Infinity : time(state.seen[id])),
    ghMentions,
    jiraMentions,
    newComments: new Map(),
    prNotes,
    ticketNotes,
  };

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
      offSprint: inp.offSprintKeys?.has(key.toUpperCase()) ?? false,
    };
  };

  // Step 2: group by ticket key; ticketless PRs become singleton tabs.
  const byKey = new Map<string, DeckPR[]>();
  const tickets: DeckTicket[] = [];
  const collected = collectPRs(inp);
  // My merged PRs, listed under their ticket's tab so a ticket whose PRs have
  // all merged doesn't read "No PR yet". They never make a tab of their own.
  const openUrls = new Set(collected.map((c) => c.pr.html_url));
  const mergedByKey = new Map<string, DeckPR[]>();
  for (const pr of [...(inp.ticketMergedPRs ?? [])].sort(byMergedDesc)) {
    const key = ticketKeyOf(pr)?.toUpperCase();
    if (!key || !pr.merged_at || openUrls.has(pr.html_url)) continue;
    mergedByKey.set(key, [...(mergedByKey.get(key) ?? []), mergedDeckPR(pr, ctx, now)]);
  }
  for (const c of collected) {
    const p = deckPR(c, ctx, now);
    const key = ticketKeyOf(c.pr)?.toUpperCase() ?? null;
    if (!key) {
      tickets.push(deckTicket(prPin(c.pr), null, null, [p], ctx));
      continue;
    }
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  for (const [key, prs] of byKey) {
    tickets.push(deckTicket(key, key, ref(key), prs, ctx, mergedByKey.get(key)));
  }

  // Step 3: in-progress tickets assigned to me with no open PR (v1's workingOn rule).
  for (const issue of inp.assignedIssues) {
    const key = issue.key.toUpperCase();
    if (statusCategoryOf(issue) === "indeterminate" && !byKey.has(key)) {
      byKey.set(key, []);
      const t = deckTicket(key, key, ref(key), [], ctx, mergedByKey.get(key));
      tickets.push(
        inp.ticketMergedLoading && t.prs.length === 0 ? { ...t, mergedLoading: true } : t,
      );
    }
  }

  // #todo notes (option 2 of the design): a note on a PR or ticket that has a
  // tab (closed ones included) joins that tab's `todos`; any other becomes a
  // tab of its own.
  const tabOfPR = new Map<string, DeckTicket>();
  for (const t of tickets) for (const p of t.prs) tabOfPR.set(prNoteKey(p.pr), t);
  const byNewest = [...todoNotes].sort(
    (a, b) => time(b.created_at) - time(a.created_at) || b.id - a.id,
  );
  const noteTabs: DeckTicket[] = [];
  for (const n of byNewest) {
    const prKey = normalizeNoteRef(n.reference_id);
    const ticketKey = noteTicketKey(n);
    const host =
      (prKey ? tabOfPR.get(prKey) : undefined) ??
      (ticketKey ? tickets.find((t) => t.key === ticketKey) : undefined);
    if (host) host.todos.push(n);
    else noteTabs.push(noteTab(n, ctx));
  }
  tickets.push(...noteTabs);

  // A `ticket:<KEY>` pin set while the ticket had no PR moves onto its first
  // card-order PR once PRs land, else nothing could ever un-pin it (Space and
  // ⌘K toggle the PR). Rebuild with the migrated pins so this build shows them.
  const migrateCurrent: NonNullable<DeckStateUpdates["migrateCurrent"]> = [];
  for (const id of state.current) {
    if (!id.startsWith("ticket:")) continue;
    const key = id.slice("ticket:".length).toUpperCase();
    const t = tickets.find((x) => x.key === key);
    // Merged PRs can't hold a pin, so a ticket whose PRs have all merged keeps its own.
    const open = t?.prs.filter(isOpen) ?? [];
    if (!t || open.length === 0) continue;
    const to = open.some((p) => p.current) ? null : prPin(open[0].pr);
    migrateCurrent.push({ from: id, to, ticketId: t.id });
  }
  if (migrateCurrent.length > 0) {
    const swap = new Map(migrateCurrent.map((m) => [m.from, m.to]));
    const migrated = state.current.flatMap((id) => {
      if (!swap.has(id)) return [id];
      const to = swap.get(id);
      return to ? [to] : [];
    });
    const out = buildDeck(inp, { ...state, current: migrated }, now);
    out.stateUpdates.migrateCurrent = migrateCurrent;
    return out;
  }

  // Step 5: split into groups (spec §5.3). Arrival is never rewritten.
  const added = newArrivals(tickets, state.arrival, issueOf);
  const arrival = { ...state.arrival, ...added };
  const byArrival = [...tickets].sort((a, b) => arrival[a.id] - arrival[b.id]);

  // Closed wins over current: a tab I closed stays closed until it reopens.
  const reopen = byArrival
    .filter((t) => t.id in state.closed && reopens(t, state.closed[t.id]))
    .map((t) => t.id);
  const reopened = new Set(reopen);
  const isClosed = (t: DeckTicket) => t.id in state.closed && !reopened.has(t.id);
  const closed = byArrival
    .filter(isClosed)
    .sort((a, b) => time(state.closed[b.id]) - time(state.closed[a.id]));
  const live = byArrival.filter((t) => !isClosed(t));
  // Order marked; ids missing from currentTickets go last, in arrival order (stable sort).
  const rank = (id: string) => {
    const i = state.currentTickets.indexOf(id);
    return i === -1 ? state.currentTickets.length : i;
  };
  const current = live.filter((t) => t.current).sort((a, b) => rank(a.id) - rank(b.id));
  // Note tabs after the work, so the rail can show them as their own group.
  const open = [
    ...live.filter((t) => !t.current && !t.noteItem),
    ...live.filter((t) => !t.current && t.noteItem),
  ];

  // Prune current entries whose PR merged/closed or whose ticket left the deck.
  const prPins = new Set(collected.map((c) => prPin(c.pr)));
  const ticketIds = new Set(tickets.map((t) => t.id));
  const dropCurrent = state.current.filter(
    (id) =>
      (id.startsWith("pr:") && !prPins.has(id)) ||
      (id.startsWith("ticket:") && !ticketIds.has(id.slice("ticket:".length))) ||
      (id.startsWith("note:") && !ticketIds.has(id)),
  );

  // Ticket ids whose every current item is being dropped (spec §5.6).
  // A ticket loses its place in ▶ Current if it's no longer in the deck or no longer current.
  const dropCurrentTickets: string[] = [];
  for (const ticketId of state.currentTickets) {
    const ticket = tickets.find((t) => t.id === ticketId);
    // If the ticket is gone or no longer current, it should be removed from currentTickets
    if (!ticket || !ticket.current) {
      dropCurrentTickets.push(ticketId);
    }
  }

  const stateUpdates: DeckStateUpdates = {};
  if (Object.keys(added).length > 0) stateUpdates.arrival = added;
  if (reopen.length > 0) stateUpdates.reopen = reopen;
  if (dropCurrent.length > 0) stateUpdates.dropCurrent = dropCurrent;
  if (dropCurrentTickets.length > 0) stateUpdates.dropCurrentTickets = dropCurrentTickets;
  if (seeding) {
    // Every PR at its updated_at, plus `ticket:<KEY>` = now for keyed tickets so
    // older Jira mentions don't light up on the second build.
    const seen: Record<string, string> = {};
    for (const c of collected) seen[c.pr.html_url] = c.pr.updated_at;
    for (const t of tickets) if (t.key) seen[ticketPin(t.key)] = now.toISOString();
    stateUpdates.seen = seen;
    stateUpdates.seeded = true;
  }

  return {
    current,
    merged: mergedTabs(inp.mergedPRs ?? [], ctx, ref, now),
    open,
    closed,
    unmatched: unmatchedMentions(
      inp,
      new Set(collected.map((c) => prRef(c.pr.repo_full_name, c.pr.number))),
      ticketIds,
    ),
    // Counts cover the live deck (Current + Open); closed tabs are out of the way.
    counts: {
      tickets: live.length,
      current: current.length,
      unseen: live.filter((t) => t.unseen).length,
    },
    stateUpdates,
  };
}

/** The projects of every keyed ticket on the deck, for `shortKey`. */
export function deckProjects(deck: DeckTicket[]): Set<string> {
  return new Set(deck.flatMap((t) => (t.key ? [projectOfKey(t.key)] : [])));
}

/**
 * A ticket key for the rail: just the number when every keyed ticket shares one
 * project. Pass `deckProjects(deck)` when shortening many keys, so the project
 * set is built once per render rather than once per row.
 */
export function shortKey(key: string, deck: DeckTicket[] | Set<string>): string {
  const projects = deck instanceof Set ? deck : deckProjects(deck);
  const only = projects.size === 0 || (projects.size === 1 && projects.has(projectOfKey(key)));
  return only ? key.slice(key.lastIndexOf("-") + 1) : key;
}
