import type {
  AtRiskIssue,
  AuthoredPR,
  DashboardIssue,
  IssueFlags,
  LinkedPR,
  RiskLevel,
  WorkloadEntry,
} from "../../../types/teams";
import { refLabel } from "./refLookup";

/** Plain-language names for a ticket's risk level in the member modal. */
export const LEVEL_LABELS: Record<RiskLevel, string> = {
  high: "At risk",
  attention: "Needs a look",
  normal: "On track",
};

/** "1 ticket at risk, 2 need a look": the counts behind a Work Spread row's warning icon. */
export function flagSummary(flagged: Pick<AtRiskIssue, "level">[]): string {
  const high = flagged.filter((i) => i.level === "high").length;
  const look = flagged.filter((i) => i.level === "attention").length;
  const parts: string[] = [];
  if (high > 0) parts.push(`${high} ${high === 1 ? "ticket" : "tickets"} at risk`);
  if (look > 0) {
    const noun = parts.length > 0 ? "" : look === 1 ? " ticket" : " tickets";
    parts.push(`${look}${noun} ${look === 1 ? "needs" : "need"} a look`);
  }
  return parts.join(", ");
}

/** danger = blocking, warning = slowing down, neutral = context only. */
export type SignalTone = "danger" | "warning" | "neutral";

export interface Signal {
  key: keyof IssueFlags;
  tone: SignalTone;
  text: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function days(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

/** "web#12": how a ticket row names a PR. */
function prLabel(pr: LinkedPR): string {
  return refLabel({ kind: "pr", repo: pr.repo_full_name, number: pr.number });
}

/** Calendar days from today to a Jira due date ("YYYY-MM-DD" or a full ISO string), in local time. */
function daysUntil(dueDate: string, now: Date): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate);
  const due = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dueDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

function dueText(dueDate: string | null, now: Date): string {
  if (!dueDate) return "Due soon";
  const n = daysUntil(dueDate, now);
  if (n < 0) return `Overdue by ${days(-n)}`;
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  return `Due in ${n} days`;
}

/**
 * The flags that count toward a ticket's risk level, in display order: blocking
 * first, context last. noEpic, addedAfterStart and prFailingCI are deliberately
 * absent: none is a risk. A ticket added mid-sprint says so on its card, and a
 * failing PR says "failing CI" on its own line.
 */
const SIGNALS: {
  key: keyof IssueFlags;
  tone: SignalTone;
  text: (issue: DashboardIssue, now: Date) => string;
}[] = [
  { key: "stale", tone: "warning", text: (i) => `No update for ${days(i.daysSinceUpdate)}` },
  {
    key: "prWaitingReview",
    tone: "warning",
    text: (i, now) => {
      const pr = i.linkedPRs.find((p) => p.waitingReview);
      if (!pr) return "A linked PR is waiting for a first review";
      if (!pr.createdAt) return `${prLabel(pr)} is waiting for a first review`;
      const waited = Math.max(
        1,
        Math.floor((now.getTime() - new Date(pr.createdAt).getTime()) / DAY_MS),
      );
      return `${prLabel(pr)} has waited ${days(waited)} for a first review`;
    },
  },
  { key: "dueSoon", tone: "warning", text: (i, now) => dueText(i.dueDate, now) },
  { key: "unassigned", tone: "neutral", text: () => "Nobody is assigned" },
  {
    key: "inProgressNoPR",
    tone: "neutral",
    text: (i) =>
      `${statusBucket(i) === "inReview" ? "In review" : "In progress"}, but no PR is linked yet`,
  },
];

/** Why a ticket is flagged, one plain sentence per warning sign. */
export function describeSignals(issue: DashboardIssue, now: Date): Signal[] {
  return SIGNALS.filter((s) => issue.flags[s.key]).map((s) => ({
    key: s.key,
    tone: s.tone,
    text: s.text(issue, now),
  }));
}

export type PRTone = "danger" | "warning" | "success" | "purple" | "neutral";

/** What a PR line needs, whether it came linked to a ticket or from the member's own PRs. */
type PRLike = Pick<LinkedPR, "number" | "title" | "repo_full_name" | "state" | "author"> &
  Partial<
    Pick<
      LinkedPR,
      | "checks_status"
      | "createdAt"
      | "mergedAt"
      | "reviewState"
      | "waitingReview"
      | "mergedBy"
      | "additions"
      | "deletions"
    >
  >;

/** One PR as the People tab lists it: under its ticket, or among the member's other PRs. */
export interface PRLine {
  repo: string;
  number: number;
  title: string;
  author: string;
  tone: PRTone;
  label: string;
  merged: boolean;
  /** When it merged, or when it opened while it's still open (ISO). */
  date: string | null;
  mergedBy: string | null;
  additions: number | null;
  deletions: number | null;
}

/** An open PR's state, by CI first, then review. */
function openState(pr: PRLike): Pick<PRLine, "tone" | "label"> {
  if (pr.checks_status === "FAILURE") return { tone: "danger", label: "failing CI" };
  if (pr.reviewState === "APPROVED") return { tone: "success", label: "approved" };
  if (pr.reviewState === "CHANGES_REQUESTED")
    return { tone: "warning", label: "changes requested" };
  if (pr.waitingReview) return { tone: "warning", label: "awaiting review" };
  if (pr.reviewState === "REVIEW_REQUIRED") return { tone: "neutral", label: "awaiting review" };
  return { tone: "neutral", label: "open" };
}

const isMerged = (pr: PRLike) => pr.state === "merged" || !!pr.mergedAt;
const prId = (pr: Pick<PRLike, "repo_full_name" | "number">) => `${pr.repo_full_name}#${pr.number}`;

/** `own` is the member's copy of the same PR: it fills fields an older cached ticket lacks. */
function toLine(pr: PRLike, own?: AuthoredPR): PRLine {
  const merged = isMerged(pr);
  return {
    repo: pr.repo_full_name,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    ...(merged ? { tone: "purple" as const, label: "merged" } : openState(pr)),
    merged,
    date: (merged ? pr.mergedAt : pr.createdAt) ?? null,
    mergedBy: pr.mergedBy ?? own?.mergedBy ?? null,
    additions: pr.additions ?? own?.additions ?? null,
    deletions: pr.deletions ?? own?.deletions ?? null,
  };
}

/**
 * A ticket's PRs, open ones first, then merged; PRs closed without a merge are
 * left out. `own` is the member's PRs, used to fill gaps in older cached data.
 */
export function ticketPRs(issue: DashboardIssue, own: AuthoredPR[] = []): PRLine[] {
  const byId = new Map(own.map((p) => [prId(p), p]));
  const live = issue.linkedPRs.filter((p) => p.state === "open" || isMerged(p));
  return [...live.filter((p) => !isMerged(p)), ...live.filter(isMerged)].map((p) =>
    toLine(p, byId.get(prId(p))),
  );
}

export type StatusBucket = "new" | "indeterminate" | "inReview" | "done";

/** Left-to-right order of the status bars and their legend. */
export const STATUS_ORDER: StatusBucket[] = ["new", "indeterminate", "inReview", "done"];

// Status colors for the Work Spread and People bars and the member detail's groups.
export const STATUS_COLORS: Record<StatusBucket, string> = {
  new: "#6e7781",
  indeterminate: "#4c8dff",
  inReview: "#e0a458",
  done: "#50c878",
};

export const STATUS_LABELS: Record<StatusBucket, string> = {
  new: "To Do",
  indeterminate: "In Progress",
  inReview: "In Review",
  done: "Done",
};

/** Mirrors the backend's classifyStatus, which feeds the Work Spread bars. */
export function statusBucket(
  issue: Pick<DashboardIssue, "status" | "statusCategory">,
): StatusBucket {
  if (issue.statusCategory === "done") return "done";
  if (/review/i.test(issue.status)) return "inReview";
  return issue.statusCategory === "indeterminate" ? "indeterminate" : "new";
}

/** A ticket with its PRs hung under it. */
export interface TicketItem {
  issue: DashboardIssue;
  prs: PRLine[];
}

export interface MemberWork {
  /** Flagged tickets, whatever their status, worst first. */
  atRisk: TicketItem[];
  needsLook: TicketItem[];
  /** The rest by status, review first; empty groups are left out. */
  groups: { bucket: StatusBucket; items: TicketItem[] }[];
  /**
   * PRs the member wrote that aren't on one of their tickets, newest first;
   * `forKey` names the teammate's sprint ticket a PR is linked to, if any.
   */
  otherPRs: { pr: PRLine; forKey: string | null }[];
}

const GROUP_ORDER: StatusBucket[] = ["inReview", "indeterminate", "new", "done"];

/** Worst first: risk score, then longest without an update. */
function byRisk(a: DashboardIssue, b: DashboardIssue): number {
  return b.risk.score - a.risk.score || b.daysSinceUpdate - a.daysSinceUpdate;
}

/**
 * Everything one member has in the sprint, as the People tab lists it: flagged
 * tickets on top, the rest by status, each with its PRs, then the PRs they
 * wrote that sit on no ticket of theirs. `login` is their GitHub username.
 */
export function memberWork(
  issues: DashboardIssue[],
  prs: AuthoredPR[],
  accountId: string,
  login: string,
): MemberWork {
  const me = login.toLowerCase();
  const own = me ? prs.filter((p) => p.author.toLowerCase() === me) : [];
  const mine = issues.filter((i) => i.assigneeAccountId === accountId);
  const item = (issue: DashboardIssue): TicketItem => ({ issue, prs: ticketPRs(issue, own) });
  const flaggedAt = (level: RiskLevel) =>
    mine
      .filter((i) => i.risk.level === level)
      .sort(byRisk)
      .map(item);

  const groups = GROUP_ORDER.map((bucket) => ({
    bucket,
    items: mine
      .filter((i) => i.risk.level === "normal" && statusBucket(i) === bucket)
      // Open work: longest without an update first. Done: most recent first.
      .sort((a, b) =>
        bucket === "done"
          ? a.daysSinceUpdate - b.daysSinceUpdate
          : b.daysSinceUpdate - a.daysSinceUpdate,
      )
      .map(item),
  })).filter((g) => g.items.length > 0);

  const onMine = new Set(mine.flatMap((i) => i.linkedPRs.map(prId)));
  const ticketOf = new Map(issues.flatMap((i) => i.linkedPRs.map((p) => [prId(p), i.key])));
  const otherPRs = own
    .filter((p) => !onMine.has(prId(p)) && (p.state === "open" || isMerged(p)))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map((p) => ({ pr: toLine(p), forKey: ticketOf.get(prId(p)) ?? null }));

  return { atRisk: flaggedAt("high"), needsLook: flaggedAt("attention"), groups, otherPRs };
}

const NEED: Record<RiskLevel, number> = { high: 3, attention: 2, normal: 1 };

/** Who needs help first: risk level, then stalled count, then WIP. Work Spread and People share it. */
export function sortByNeed(workload: WorkloadEntry[]): WorkloadEntry[] {
  return [...workload].sort(
    (a, b) =>
      NEED[b.riskLevel] - NEED[a.riskLevel] || b.stalledCount - a.stalledCount || b.wip - a.wip,
  );
}
