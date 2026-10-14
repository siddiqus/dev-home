import type { GitHubPR, JiraIssue, StatusCategoryKey } from "../../types";
import { groupByTicket, ticketKeyOf } from "../../utils/tickets";
import { ACTIONABLE_REASONS, categorizeOpenPR } from "../../utils/prCategories";
import type { Part } from "../../services/workday";
import { groupCompletionRank } from "./prState";
import type {
  BlockerItem,
  DoneItem,
  NotStartedItem,
  TicketGroup,
  TicketRef,
  WaitingItem,
  WorkdayInputs,
  WorkdaySections,
} from "./types";

/** Off-sprint not-started tickets older than this are left out. */
const OFF_SPRINT_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
/** Actionable reasons that make an open PR a blocker (the rest are softer nudges). */
const BLOCKER_REASON_KEYS = new Set(["ci_failed", "conflict", "changes_requested", "reviewed"]);

const isLoading = (p: Part<unknown>) => p.data === null && p.error === null;
/** Non-null part errors joined with "; ", or null when none failed. */
const joinErrors = (parts: Part<unknown>[]) =>
  parts
    .map((p) => p.error)
    .filter(Boolean)
    .join("; ") || null;

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

/** Copy of `items`, latest activity first (stable for ties). */
function newestFirst<T>(items: T[], at: (item: T) => number): T[] {
  return [...items].sort((a, b) => at(b) - at(a));
}

/** Latest activity in a ticket group: its newest PR or the ticket's own update, whichever is later. */
export function groupUpdatedAt(g: TicketGroup): string | null {
  const candidates = [g.ticket?.updated, ...g.prs.map((p) => p.updated_at)].filter(
    (d): d is string => !!d,
  );
  return candidates.length > 0 ? newestFirst(candidates, time)[0] : null;
}
const groupTime = (g: TicketGroup) => time(groupUpdatedAt(g));
const itemTime = (item: { pr?: GitHubPR; ticket: TicketRef | null }) =>
  time(item.pr?.updated_at ?? item.ticket?.updated);

/** Jira status category, derived from colour for issues cached before `key` was mapped. */
export function statusCategoryOf(issue: JiraIssue): StatusCategoryKey {
  const cat = issue.status?.statusCategory;
  if (cat?.key) return cat.key;
  if (cat?.colorName === "yellow") return "indeterminate";
  if (cat?.colorName === "green") return "done";
  return "new";
}

/** Compose the Workday sections from dashboard data plus the workday extras. */
export function buildWorkday(inp: WorkdayInputs, now: Date): WorkdaySections {
  const { extras } = inp;

  const assigned = new Map<string, JiraIssue>();
  for (const i of inp.assignedIssues) assigned.set(i.key.toUpperCase(), i);
  for (const i of extras.offSprint.data ?? []) {
    if (!assigned.has(i.key.toUpperCase())) assigned.set(i.key.toUpperCase(), i);
  }

  const sprintData = extras.sprint.data;
  const sprintByKey = new Map((sprintData ?? []).map((t) => [t.key.toUpperCase(), t]));
  const isOffSprint = (key: string) =>
    sprintData !== null && assigned.has(key.toUpperCase()) && !sprintByKey.has(key.toUpperCase());

  const lookup = new Map<
    string,
    { summary: string; statusName: string | null; updated?: string | null }
  >();
  for (const t of sprintData ?? [])
    lookup.set(t.key.toUpperCase(), { summary: t.summary, statusName: t.status.name });
  for (const i of [...assigned.values(), ...inp.allIssues]) {
    lookup.set(i.key.toUpperCase(), {
      summary: i.summary,
      statusName: i.status?.name ?? null,
      updated: i.updated ?? null,
    });
  }

  const ref = (key: string, flaggable = true): TicketRef => {
    const info = lookup.get(key.toUpperCase());
    return {
      key,
      summary: info?.summary ?? "",
      statusName: info?.statusName ?? null,
      updated: info?.updated ?? null,
      offSprint: flaggable && isOffSprint(key),
    };
  };
  const prRef = (pr: GitHubPR, flaggable = true) => {
    const key = ticketKeyOf(pr);
    return key ? ref(key, flaggable) : null;
  };

  const prTicketKeys = new Set(
    inp.openPRs
      .map(ticketKeyOf)
      .filter((k): k is string => !!k)
      .map((k) => k.toUpperCase()),
  );

  // Working on: my PRs grouped by ticket, in-progress tickets with no PR, and "No ticket".
  const prGroups = groupByTicket(inp.openPRs);
  const workingOnGroups: TicketGroup[] = prGroups
    .filter((g) => g.ticket !== null)
    .map((g) => ({ ticket: ref(g.ticket!), prs: g.prs }));
  for (const issue of assigned.values()) {
    if (statusCategoryOf(issue) === "indeterminate" && !prTicketKeys.has(issue.key.toUpperCase())) {
      workingOnGroups.push({ ticket: ref(issue.key), prs: [] });
    }
  }
  const noTicket = prGroups.filter((g) => g.ticket === null).flatMap((g) => g.prs);
  if (noTicket.length > 0) workingOnGroups.push({ ticket: null, prs: noTicket });
  // Closest to done first, then newest.
  const workingOn = newestFirst(workingOnGroups, groupTime).sort(
    (a, b) => groupCompletionRank(a.prs) - groupCompletionRank(b.prs),
  );

  // Reviewing: requested ∪ reviewing, deduped by URL; never off-sprint.
  const seen = new Set<string>();
  const reviewPRs = [...inp.reviewRequests, ...inp.reviewingPRs].filter((p) => {
    if (seen.has(p.html_url)) return false;
    seen.add(p.html_url);
    return true;
  });
  // Groups I've already reviewed come first, then ones with a pending request;
  // each tier newest first.
  const requestedUrls = new Set(inp.reviewRequests.map((p) => p.html_url));
  const hasRequest = (g: TicketGroup) => g.prs.some((p) => requestedUrls.has(p.html_url));
  const reviewing: TicketGroup[] = newestFirst(
    groupByTicket(reviewPRs).map((g) => ({
      ticket: g.ticket ? ref(g.ticket, false) : null,
      prs: g.prs,
    })),
    groupTime,
  ).sort((a, b) => Number(hasRequest(a)) - Number(hasRequest(b)));

  // Blockers and waiting.
  const blockers: BlockerItem[] = [];
  const waiting: WaitingItem[] = [];
  for (const pr of inp.openPRs) {
    if (pr.draft) continue;
    const category = categorizeOpenPR(pr);
    const ticket = prRef(pr);
    if (category === "needs-action") {
      const reasons = ACTIONABLE_REASONS.filter(
        (r) => BLOCKER_REASON_KEYS.has(r.key) && r.matches(pr),
      ).map((r) => r.label);
      if (reasons.length > 0) blockers.push({ kind: "pr", pr, ticket, reasons });
      continue;
    }
    if (category === "pending") {
      if (
        Array.isArray(pr.requested_reviewers) &&
        pr.requested_reviewers.length === 0 &&
        !pr.review_status
      ) {
        blockers.push({ kind: "pr", pr, ticket, reasons: ["No reviewer requested"] });
      } else {
        waiting.push({
          kind: "awaiting-review",
          pr,
          ticket,
          reviewers: pr.requested_reviewers ?? [],
          since: pr.created_at,
        });
      }
      continue;
    }
    if (pr.review_status === "APPROVED" && !pr.in_merge_queue) {
      waiting.push({ kind: "your-move", pr, ticket });
    }
  }
  const flaggedKeys = new Set<string>();
  for (const t of sprintData ?? []) if (t.flagged) flaggedKeys.add(t.key.toUpperCase());
  for (const t of extras.offSprint.data ?? []) if (t.flagged) flaggedKeys.add(t.key.toUpperCase());
  for (const issue of assigned.values()) {
    if (flaggedKeys.has(issue.key.toUpperCase()))
      blockers.push({ kind: "flagged", ticket: ref(issue.key) });
  }
  for (const issue of assigned.values()) {
    const reviewers = (issue.codeReviewers ?? []).map((r) => r.displayName).filter(Boolean);
    if (/code review/i.test(issue.status?.name ?? "") && reviewers.length > 0) {
      waiting.push({ kind: "code-review", ticket: ref(issue.key), reviewers });
    }
  }

  // Done since.
  const done: DoneItem[] = [
    ...(extras.merged.data ?? []).map(
      (pr): DoneItem => ({
        kind: "merged",
        pr,
        ticket: prRef(pr),
        at: pr.merged_at ?? pr.updated_at,
      }),
    ),
    ...(extras.reviewed.data ?? []).map(
      (r): DoneItem => ({
        kind: "reviewed",
        pr: r.pr,
        ticket: prRef(r.pr, false),
        state: r.state,
        at: r.submittedAt,
      }),
    ),
    ...(extras.doneTickets.data ?? []).map((t): DoneItem => {
      if (!lookup.has(t.key.toUpperCase()))
        lookup.set(t.key.toUpperCase(), { summary: t.summary, statusName: t.toStatus });
      return { kind: "status", ticket: ref(t.key), toStatus: t.toStatus, at: t.changedAt };
    }),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const doneParts = [extras.merged, extras.reviewed, extras.doneTickets];

  // Not started.
  const notStartedSprint: NotStartedItem[] = [];
  const notStartedOff: NotStartedItem[] = [];
  const cutoff = now.getTime() - OFF_SPRINT_WINDOW_MS;
  const newIssues = [...assigned.values()].filter(
    (i) => statusCategoryOf(i) === "new" && !prTicketKeys.has(i.key.toUpperCase()),
  );
  for (const issue of newIssues) {
    const sprint = sprintByKey.get(issue.key.toUpperCase());
    const item: NotStartedItem = {
      ticket: ref(issue.key),
      sprintName: sprint?.sprintName ?? null,
      points: sprint?.points ?? null,
      updated: issue.updated ?? null,
    };
    if (!item.ticket.offSprint) notStartedSprint.push(item);
    else if (issue.updated && new Date(issue.updated).getTime() >= cutoff) notStartedOff.push(item);
  }
  const notStartedTime = (n: NotStartedItem) => time(n.updated);

  const offKeys = new Set<string>();
  const noteOff = (t: TicketRef | null) => t?.offSprint && offKeys.add(t.key.toUpperCase());
  workingOn.forEach((g) => noteOff(g.ticket));
  blockers.forEach((b) => noteOff(b.ticket));
  waiting.forEach((w) => noteOff(w.ticket));
  notStartedOff.forEach((n) => noteOff(n.ticket));
  done.forEach((d) => noteOff(d.ticket));

  const jiraParts = [extras.sprint, extras.offSprint];
  const jiraLoading = jiraParts.some(isLoading);
  const jiraError = joinErrors(jiraParts);

  return {
    done: {
      items: done,
      loading: doneParts.some(isLoading),
      error: joinErrors(doneParts),
    },
    workingOn: { items: workingOn, loading: false, error: null },
    reviewing: { items: reviewing, loading: false, error: null },
    reviewRequestedUrls: requestedUrls,
    blockers: { items: newestFirst(blockers, itemTime), loading: jiraLoading, error: jiraError },
    waiting: { items: newestFirst(waiting, itemTime), loading: false, error: null },
    notStarted: {
      items: newestFirst(notStartedSprint, notStartedTime),
      offSprintItems: newestFirst(notStartedOff, notStartedTime),
      loading: jiraLoading,
      error: jiraError,
    },
    offSprintCount: offKeys.size,
  };
}

export interface KeyedGroup<T> {
  /** Ticket key; null for a ticketless item (always its own group). */
  key: string | null;
  items: T[];
}

/** Group items by ticket key in first-seen order, so a list's order survives. */
export function groupByTicketKey<T>(
  items: T[],
  keyOf: (item: T) => string | null,
): KeyedGroup<T>[] {
  const groups: KeyedGroup<T>[] = [];
  const byKey = new Map<string, KeyedGroup<T>>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = key ? byKey.get(key) : undefined;
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const group = { key, items: [item] };
    groups.push(group);
    if (key) byKey.set(key, group);
  }
  return groups;
}
