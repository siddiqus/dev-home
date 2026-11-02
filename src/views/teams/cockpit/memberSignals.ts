import type {
  AtRiskIssue,
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
 * first, context last. noEpic is deliberately absent: it isn't a risk.
 */
const SIGNALS: {
  key: keyof IssueFlags;
  tone: SignalTone;
  text: (issue: DashboardIssue, now: Date) => string;
}[] = [
  {
    key: "prFailingCI",
    tone: "danger",
    text: (i) => {
      const pr = i.linkedPRs.find((p) => p.checks_status === "FAILURE");
      return pr ? `${prLabel(pr)} is failing CI` : "A linked PR is failing CI";
    },
  },
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
  { key: "addedAfterStart", tone: "neutral", text: () => "Added after the sprint started" },
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

export interface PRBadge {
  repo: string;
  number: number;
  tone: PRTone;
  label: string;
}

/** An open PR's state, by CI first, then review. */
function openBadge(pr: LinkedPR): Pick<PRBadge, "tone" | "label"> {
  if (pr.checks_status === "FAILURE") return { tone: "danger", label: "failing CI" };
  if (pr.reviewState === "APPROVED") return { tone: "success", label: "approved" };
  if (pr.reviewState === "CHANGES_REQUESTED")
    return { tone: "warning", label: "changes requested" };
  if (pr.waitingReview) return { tone: "warning", label: "awaiting review" };
  if (pr.reviewState === "REVIEW_REQUIRED") return { tone: "neutral", label: "awaiting review" };
  return { tone: "neutral", label: "open" };
}

/** The ticket's open PRs, then its merged ones, each with its state. PRs closed unmerged are left out. */
export function prBadges(issue: DashboardIssue): PRBadge[] {
  const badge = (pr: LinkedPR, state: Pick<PRBadge, "tone" | "label">): PRBadge => ({
    repo: pr.repo_full_name,
    number: pr.number,
    ...state,
  });
  const open = issue.linkedPRs.filter((p) => p.state === "open");
  const merged = issue.linkedPRs.filter(
    (p) => p.state !== "open" && (p.state === "merged" || p.mergedAt),
  );
  return [
    ...open.map((p) => badge(p, openBadge(p))),
    ...merged.map((p) => badge(p, { tone: "purple", label: "merged" })),
  ];
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

export interface MemberTickets {
  /** Every ticket by status, review first; empty groups are left out. */
  groups: { bucket: StatusBucket; issues: DashboardIssue[] }[];
}

const GROUP_ORDER: StatusBucket[] = ["inReview", "indeterminate", "new", "done"];

export function memberTickets(issues: DashboardIssue[], accountId: string): MemberTickets {
  const mine = issues.filter((i) => i.assigneeAccountId === accountId);

  const groups = GROUP_ORDER.map((bucket) => ({
    bucket,
    issues: mine
      .filter((i) => statusBucket(i) === bucket)
      // Open work: longest without an update first. Done: most recent first.
      .sort((a, b) =>
        bucket === "done"
          ? a.daysSinceUpdate - b.daysSinceUpdate
          : b.daysSinceUpdate - a.daysSinceUpdate,
      ),
  })).filter((g) => g.issues.length > 0);

  return { groups };
}

const NEED: Record<RiskLevel, number> = { high: 3, attention: 2, normal: 1 };

/** Who needs help first: risk level, then stalled count, then WIP. Work Spread and People share it. */
export function sortByNeed(workload: WorkloadEntry[]): WorkloadEntry[] {
  return [...workload].sort(
    (a, b) =>
      NEED[b.riskLevel] - NEED[a.riskLevel] || b.stalledCount - a.stalledCount || b.wip - a.wip,
  );
}
