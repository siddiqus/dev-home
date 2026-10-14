import type { BadgeVariant } from "../../components/primitives/Badge";
import type { GitHubPR, ReviewState } from "../../types";
import { compactAge } from "../workday/dates";
import { repoRef, reviewingState, REVIEWING_LABEL, titleWithoutKey } from "../workday/prState";
import type { TicketRef, WorkdaySections } from "../workday/types";

/** What a standup row points at: a PR (opens it) or a ticket (opens the issue). */
export type StandupTarget = { kind: "pr"; pr: GitHubPR } | { kind: "ticket"; key: string };

export interface StandupTag {
  text: string;
  tone: BadgeVariant;
}

/** One standup line: a ticket and/or PRs, with what it points at. */
export interface StandupItem {
  id: string;
  ticketKey: string | null;
  title: string;
  /** PRs shown as repo#number after the title. */
  prs: GitHubPR[];
  /** Short state badge, e.g. "approved" or "draft". */
  tag: StandupTag | null;
  /** Muted trailing fact, e.g. "from abu · 2d". */
  detail: string | null;
  offSprint: boolean;
  target: StandupTarget;
}

/** Items that share an action, e.g. "Merged" or "Moved to Done". */
export interface StandupGroup {
  id: string;
  label: string;
  tone: BadgeVariant;
  items: StandupItem[];
}

export interface StandupGroups {
  yesterday: StandupGroup[];
  today: StandupGroup[];
  blockers: StandupGroup[];
}

const REVIEW_TAG: Record<ReviewState, StandupTag> = {
  APPROVED: { text: "approved", tone: "success" },
  CHANGES_REQUESTED: { text: "changes requested", tone: "warning" },
  COMMENTED: { text: "commented", tone: "neutral" },
};

/** Colour for a "Moved to X" group, from the status name. */
export function statusTone(status: string): BadgeVariant {
  const s = status.toLowerCase();
  if (/won'?t|cancel|reject|duplicate|invalid|obsolete/.test(s)) return "neutral";
  if (/done|closed|resolved|released|complete|shipped/.test(s)) return "success";
  if (/review|qa|test|verif/.test(s)) return "purple";
  if (/progress|develop|doing/.test(s)) return "info";
  if (/block/.test(s)) return "danger";
  return "neutral";
}

const prTarget = (pr: GitHubPR): StandupTarget => ({ kind: "pr", pr });
const ticketTarget = (ticket: TicketRef): StandupTarget => ({ kind: "ticket", key: ticket.key });

function prItem(id: string, pr: GitHubPR, ticket: TicketRef | null): StandupItem {
  return {
    id,
    ticketKey: ticket?.key ?? null,
    title: titleWithoutKey(pr.title, ticket?.key ?? null),
    prs: [pr],
    tag: null,
    detail: null,
    offSprint: ticket?.offSprint ?? false,
    target: prTarget(pr),
  };
}

function ticketItem(id: string, ticket: TicketRef, prs: GitHubPR[] = []): StandupItem {
  return {
    id,
    ticketKey: ticket.key,
    title: ticket.summary,
    prs,
    tag: null,
    detail: null,
    offSprint: ticket.offSprint,
    target: ticketTarget(ticket),
  };
}

/** Groups in insertion order, created on first use. */
function grouper() {
  const groups = new Map<string, StandupGroup>();
  return {
    add(id: string, label: string, tone: BadgeVariant, item: StandupItem) {
      let g = groups.get(id);
      if (!g) groups.set(id, (g = { id, label, tone, items: [] }));
      g.items.push(item);
    },
    list: (order: string[] = []) => {
      const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
      return [...groups.values()].sort((a, b) => rank(a.id) - rank(b.id));
    },
  };
}

/**
 * The standup grouped by action: Yesterday (merged, moved to each status,
 * reviewed), Today (in review, in progress, reviewing) and Blockers (needs
 * attention, flagged, ready to merge, waiting on review, in Code Review).
 * Today skips what the Blockers / needs-attention section holds.
 */
export function standupGroups(s: WorkdaySections, now: Date): StandupGroups {
  // Yesterday
  const y = grouper();
  for (const item of s.done.items) {
    if (item.kind === "merged") {
      y.add("merged", "Merged", "purple", prItem(`m:${item.pr.html_url}`, item.pr, item.ticket));
    } else if (item.kind === "status") {
      const status = item.toStatus;
      y.add(
        `moved:${status.toLowerCase()}`,
        `Moved to ${status}`,
        statusTone(status),
        ticketItem(`s:${item.ticket.key}:${status}`, item.ticket),
      );
    } else {
      const it = prItem(`r:${item.pr.html_url}`, item.pr, item.ticket);
      it.tag = REVIEW_TAG[item.state];
      if (item.pr.state === "merged") it.detail = "since merged";
      else if (item.pr.state === "closed") it.detail = "since closed";
      y.add("reviewed", "Reviewed", "info", it);
    }
  }
  // Merged first, then Done-like moves, other moves, and Reviewed last.
  const yesterday = y.list().sort((a, b) => yRank(a) - yRank(b));

  // What the Blockers / needs-attention section holds; Today skips exactly these.
  const attentionPRs = new Set<string>();
  const flaggedKeys = new Set<string>();
  for (const b of s.blockers.items) {
    if (b.kind === "flagged") flaggedKeys.add(b.ticket.key.toUpperCase());
    else attentionPRs.add(b.pr.html_url);
  }
  // Ticket keys that get a Blockers line from one of their PRs.
  const prLineKeys = new Set<string>();
  for (const item of [...s.blockers.items, ...s.waiting.items]) {
    if (item.kind !== "flagged" && item.kind !== "code-review" && item.ticket)
      prLineKeys.add(item.ticket.key.toUpperCase());
  }

  // Blockers
  const b = grouper();
  const seenPRs = new Set<string>();
  const seenKeys = new Set<string>();
  const firstPR = (pr: GitHubPR) => !seenPRs.has(pr.html_url) && !!seenPRs.add(pr.html_url);
  const firstKey = (key: string) =>
    !seenKeys.has(key.toUpperCase()) && !!seenKeys.add(key.toUpperCase());
  for (const item of s.blockers.items) {
    if (item.kind === "flagged") {
      if (firstKey(item.ticket.key))
        b.add(
          "flagged",
          "Flagged in Jira",
          "danger",
          ticketItem(`f:${item.ticket.key}`, item.ticket),
        );
    } else if (firstPR(item.pr)) {
      const it = prItem(`a:${item.pr.html_url}`, item.pr, item.ticket);
      it.detail = item.reasons.join(", ").toLowerCase();
      b.add("attention", "Needs attention", "danger", it);
    }
  }
  for (const w of s.waiting.items) {
    if (w.kind === "code-review") {
      if (prLineKeys.has(w.ticket.key.toUpperCase()) || !firstKey(w.ticket.key)) continue;
      const it = ticketItem(`c:${w.ticket.key}`, w.ticket);
      it.detail = w.reviewers.length > 0 ? `with ${w.reviewers.join(", ")}` : null;
      b.add("code-review", "In Code Review", "purple", it);
    } else if (!firstPR(w.pr)) {
      continue;
    } else if (w.kind === "your-move") {
      b.add(
        "ship",
        "Approved, ready to merge",
        "success",
        prItem(`y:${w.pr.html_url}`, w.pr, w.ticket),
      );
    } else {
      const it = prItem(`w:${w.pr.html_url}`, w.pr, w.ticket);
      const from = w.reviewers.length > 0 ? `from ${w.reviewers.join(", ")} · ` : "";
      it.detail = `${from}${compactAge(w.since, now)}`;
      b.add("waiting", "Waiting on review", "warning", it);
    }
  }
  const blockers = b.list(["attention", "flagged", "ship", "waiting", "code-review"]);

  // Today
  const t = grouper();
  const addWork = (id: "progress" | "review", it: StandupItem) =>
    id === "review" ? t.add(id, "In review", "purple", it) : t.add(id, "In progress", "info", it);
  for (const g of s.workingOn.items) {
    const prs = g.prs.filter((p) => !attentionPRs.has(p.html_url));
    if (g.ticket === null) {
      for (const p of prs) {
        const it = prItem(`t:${p.html_url}`, p, null);
        if (p.draft) it.tag = { text: "draft", tone: "neutral" };
        addWork(p.draft ? "progress" : "review", it);
      }
      continue;
    }
    if (flaggedKeys.has(g.ticket.key.toUpperCase())) continue;
    if (g.prs.length > 0 && prs.length === 0) continue;
    const it = ticketItem(`t:${g.ticket.key}`, g.ticket, prs);
    const inReview = prs.some((p) => !p.draft);
    if (prs.length === 0) it.tag = { text: "no PR yet", tone: "neutral" };
    else if (!inReview) it.tag = { text: "draft", tone: "neutral" };
    addWork(inReview ? "review" : "progress", it);
  }
  for (const g of s.reviewing.items) {
    const pr = g.prs[0];
    if (!pr) continue;
    const it =
      g.ticket && g.prs.length > 1
        ? ticketItem(`v:${g.ticket.key}`, g.ticket, g.prs)
        : prItem(`v:${pr.html_url}`, pr, g.ticket);
    const state = REVIEWING_LABEL[reviewingState(pr, s.reviewRequestedUrls.has(pr.html_url))];
    it.tag = { text: state.label.toLowerCase(), tone: state.tone };
    t.add("reviewing", "Reviewing", "info", it);
  }
  const today = t.list(["progress", "review", "reviewing"]);

  return { yesterday, today, blockers };
}

function yRank(g: StandupGroup): number {
  if (g.id === "merged") return 0;
  if (g.id === "reviewed") return 4;
  return g.tone === "success" ? 1 : g.tone === "neutral" ? 3 : 2;
}

/** "CCP-1 Fix login (dev-home#12)" style text for one item. */
export function itemText(it: StandupItem): string {
  const head = [it.ticketKey, it.title].filter(Boolean).join(" ");
  const refs = it.prs.map(repoRef).join(", ");
  const extras = [refs, it.tag?.text, it.detail, it.offSprint ? "off-sprint" : null].filter(
    Boolean,
  );
  return extras.length > 0 ? `${head} (${extras.join(" · ")})` : head;
}

/** Note text as bullet lines: one per non-empty line, leading "-", "*" or "•" dropped. */
export function noteLines(noteContent: string): string[] {
  return noteContent
    .split("\n")
    .map((raw) => raw.trim().replace(/^([-*•])\s+/, ""))
    .filter(Boolean);
}

/**
 * Slack-ready standup from the same groups the sheet shows: *Section*, then
 * _Group_ and its bullets. The note's lines go last under Blockers.
 */
export function standupGroupsToMarkdown(g: StandupGroups, noteContent: string): string {
  const section = (title: string, groups: StandupGroup[], extra: string[] = []) => {
    const body = groups.map((grp) =>
      [`_${grp.label}_`, ...grp.items.map((it) => `• ${itemText(it)}`)].join("\n"),
    );
    if (extra.length > 0) body.push(extra.map((l) => `• ${l}`).join("\n"));
    return body.length === 0 ? null : [`*${title}*`, ...body].join("\n");
  };
  return [
    section("Yesterday", g.yesterday),
    section("Today", g.today),
    section("Blockers", g.blockers, noteLines(noteContent)),
  ]
    .filter((x): x is string => x !== null)
    .join("\n\n");
}
