import type { GitHubPR } from "../../types";
import type { BadgeVariant } from "../../components/primitives/Badge";
import { noReviewer, RED_CHECK_STATUSES } from "../../utils/prCategories";

/** A single label + tone, the one place a row shows state. */
export interface StateBadge {
  label: string;
  tone: BadgeVariant;
}

export const ciFailing = (pr: GitHubPR) =>
  !!pr.checks_status && RED_CHECK_STATUSES.has(pr.checks_status);

/** Approved, CI green, no conflict, not already queued: ready to merge. */
export const readyToMerge = (pr: GitHubPR) =>
  !pr.draft &&
  pr.review_status === "APPROVED" &&
  pr.checks_status === "SUCCESS" &&
  !pr.has_conflict &&
  !pr.in_merge_queue;

/**
 * The most severe state of one of my PRs:
 * CI failing > Conflict > Changes requested > No reviewer > Approved > Waiting on … > Draft.
 * Drafts skip the review states (nobody is expected to review them yet).
 */
export function myPRState(pr: GitHubPR): StateBadge {
  if (ciFailing(pr)) return { label: "CI failing", tone: "danger" };
  if (pr.has_conflict) return { label: "Conflict", tone: "danger" };
  if (pr.review_status === "CHANGES_REQUESTED")
    return { label: "Changes requested", tone: "danger" };
  if (pr.draft) return { label: "Draft", tone: "neutral" };
  if (pr.in_merge_queue) return { label: "In merge queue", tone: "purple" };
  if (noReviewer(pr)) return { label: "No reviewer", tone: "warning" };
  if (pr.review_status === "APPROVED") return { label: "Approved", tone: "success" };
  const reviewers = pr.requested_reviewers ?? [];
  if (reviewers.length > 0) return { label: `Waiting on ${reviewers.join(", ")}`, tone: "neutral" };
  if (pr.review_status === "REVIEWED") return { label: "Reviewed", tone: "warning" };
  return { label: "In review", tone: "neutral" };
}

/** Severity rank of the labels myPRState can return (lower = worse). */
const SEVERITY = [
  "CI failing",
  "Conflict",
  "Changes requested",
  "No reviewer",
  "Reviewed",
  "Approved",
  "In merge queue",
  "Waiting on",
  "In review",
  "Draft",
];
const rank = (s: StateBadge) => {
  const i = SEVERITY.findIndex((label) => s.label.startsWith(label));
  return i < 0 ? SEVERITY.length : i;
};

/**
 * How close one of my PRs is to merging (lower = closer), from review progress
 * alone: In merge queue < Approved < In review < Changes requested < No reviewer
 * < Draft. Approval wins over CI, conflicts and open threads.
 */
export function completionRank(pr: GitHubPR): number {
  if (pr.draft) return 5;
  if (pr.in_merge_queue) return 0;
  if (pr.review_status === "APPROVED") return 1;
  if (pr.review_status === "CHANGES_REQUESTED") return 3;
  if (noReviewer(pr)) return 4;
  return 2;
}

/** A ticket's distance from done: its least complete PR, past every PR rank when it has none. */
export const groupCompletionRank = (prs: GitHubPR[]) =>
  prs.length === 0 ? 6 : Math.max(...prs.map(completionRank));

export const NO_PR_YET: StateBadge = { label: "No PR yet", tone: "neutral" };

/** The most severe state across a ticket's PRs; "No PR yet" when there are none. */
export function worstState(prs: GitHubPR[]): StateBadge {
  return (
    prs
      .map(myPRState)
      .reduce<StateBadge | null>(
        (worst, s) => (worst === null || rank(s) < rank(worst) ? s : worst),
        null,
      ) ?? NO_PR_YET
  );
}

/** Where a PR I'm reviewing stands, as Standup's Reviewing one-liner label. */
export type ReviewingState = "re-requested" | "new-commits" | "requested" | "waiting-author";

export const REVIEWING_LABEL: Record<ReviewingState, StateBadge> = {
  "re-requested": { label: "Re-requested", tone: "warning" },
  "new-commits": { label: "New commits", tone: "warning" },
  requested: { label: "Requested", tone: "info" },
  "waiting-author": { label: "Waiting on author", tone: "neutral" },
};

/** Requested → re-requested/requested; otherwise new commits since my non-approving review, else waiting on the author. */
export function reviewingState(pr: GitHubPR, requested: boolean): ReviewingState {
  if (requested) return pr.viewer_engaged ? "re-requested" : "requested";
  if (pr.new_commits_since_review && pr.viewer_review_state !== "APPROVED") return "new-commits";
  return "waiting-author";
}

/** "o/repo" + 12 → "repo#12". */
export const repoRef = (pr: GitHubPR) => `${pr.repo_full_name.split("/").pop()}#${pr.number}`;

/** Drop a leading ticket key (plus separators) from a PR title, e.g. "CCP-1: Fix" → "Fix". */
export function titleWithoutKey(title: string, key: string | null): string {
  if (!key) return title;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return title.replace(new RegExp(`^${escaped}(?!\\d)[:\\s\\-–—]*`, "i"), "") || title;
}
