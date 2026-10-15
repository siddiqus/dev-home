import type { GitHubPR } from "../types";
import type { BadgeVariant } from "../components/primitives/Badge";
import { noReviewer, RED_CHECK_STATUSES } from "./prCategories";

/**
 * What I'm supposed to do with a PR, as one tag. Every open PR I author or
 * review gets exactly one, even when the answer is "nothing, skip it"
 * ("Waiting on …"), so no card is left blank.
 *
 * `key` matches the ACTIONABLE_REASONS key the action restates (so a fact chip
 * saying the same thing can be dropped), or an action-only key otherwise.
 * `rank` orders actions across PRs: lower needs me more.
 */
export interface PRAction {
  key: string;
  label: string;
  tone: BadgeVariant;
  rank: number;
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
 * The ACTIONABLE_REASONS keys an action already says, so the reason chips next
 * to it skip them (e.g. "Respond to feedback · 2 open threads" covers
 * Reviewed, Your turn and Unresolved).
 */
export function restatedReasons(action: PRAction | null | undefined): string[] {
  if (!action) return [];
  if (action.key === "your_turn") return ["your_turn", "reviewed", "unresolved"];
  if (action.key === "changes_requested") return ["changes_requested", "unresolved"];
  return [action.key];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** " · 2 open threads", or "" without open threads. */
const threadsSuffix = (pr: GitHubPR) => {
  const n = pr.unresolved_thread_count ?? 0;
  return n > 0 ? ` · ${plural(n, "open thread")}` : "";
};

/**
 * The next step on one of my own PRs, most blocking first:
 * fix CI > resolve conflict > address changes > (draft) > merge queue > merge >
 * respond to feedback > request a review > re-request review > wait.
 *
 * A comment-only review ("REVIEWED") is never left as a bare state: when the
 * newest discussion is someone else's (`your_turn`) I owe a response; when I've
 * answered and nobody is requested any more, I owe a re-request.
 */
export function authorAction(pr: GitHubPR): PRAction {
  if (ciFailing(pr)) return { key: "ci_failed", label: "Fix CI", tone: "danger", rank: 0 };
  if (pr.has_conflict)
    return {
      key: "conflict",
      label: `Resolve conflict with ${pr.base.ref || "base"}`,
      tone: "danger",
      rank: 1,
    };
  if (pr.review_status === "CHANGES_REQUESTED")
    return {
      key: "changes_requested",
      label: `Address requested changes${threadsSuffix(pr)}`,
      tone: "danger",
      rank: 2,
    };
  if (pr.draft)
    return { key: "draft", label: "Draft · mark ready for review", tone: "neutral", rank: 11 };
  if (pr.in_merge_queue)
    return { key: "merge_queue", label: "In merge queue", tone: "purple", rank: 8 };
  if (readyToMerge(pr)) return { key: "merge", label: "Ready to merge", tone: "success", rank: 6 };
  if (pr.review_status === "APPROVED")
    return { key: "approved", label: "Approved · merge when CI passes", tone: "success", rank: 7 };
  const reviewers = pr.requested_reviewers ?? [];
  const threads = pr.unresolved_thread_count ?? 0;
  if (pr.your_turn && (pr.review_status === "REVIEWED" || threads > 0))
    return {
      key: "your_turn",
      label: `Respond to feedback${threadsSuffix(pr)}`,
      tone: "warning",
      rank: 3,
    };
  if (noReviewer(pr))
    return { key: "no_reviewer", label: "Request a review", tone: "warning", rank: 4 };
  if (pr.review_status === "REVIEWED" && reviewers.length === 0)
    return { key: "reviewed", label: "Re-request review", tone: "warning", rank: 5 };
  if (reviewers.length > 0)
    return {
      key: "waiting",
      label: `Waiting on ${reviewers.join(", ")}`,
      tone: "neutral",
      rank: 9,
    };
  return { key: "waiting", label: "Waiting for review", tone: "neutral", rank: 10 };
}

/**
 * The next step on a PR I review. `requested`: my review is currently requested.
 * "New commits since your review" only counts after a non-approving review.
 */
export function reviewerAction(pr: GitHubPR, requested: boolean): PRAction {
  if (pr.draft) return { key: "draft", label: "Draft · no review yet", tone: "neutral", rank: 5 };
  if (requested && pr.viewer_engaged)
    return {
      key: "re_requested",
      label: `Re-review requested by ${pr.user.login}`,
      tone: "warning",
      rank: 0,
    };
  if (pr.new_commits_since_review && pr.viewer_review_state !== "APPROVED")
    return { key: "new_commits", label: "New commits since your review", tone: "warning", rank: 1 };
  if (requested) return { key: "requested", label: "Review requested", tone: "info", rank: 2 };
  if (pr.viewer_review_state === "APPROVED")
    return { key: "approved", label: "You approved · nothing to do", tone: "success", rank: 4 };
  return { key: "waiting_author", label: "Waiting on author", tone: "neutral", rank: 3 };
}

/**
 * The action for any PR from the viewer's seat: author → authorAction; requested
 * or already reviewed → reviewerAction; null for PRs I'm not involved in, which
 * have no step for me (callers fall back to a plain status). Null for closed PRs.
 */
export function prAction(pr: GitHubPR, viewer: string): PRAction | null {
  if (pr.state !== "open" || pr.merged_at) return null;
  const me = viewer.toLowerCase();
  if (!me) return null;
  if (pr.user.login.toLowerCase() === me) return authorAction(pr);
  const requested = (pr.requested_reviewers ?? []).some((r) => r.toLowerCase() === me);
  if (requested || pr.viewer_review_state || pr.viewer_engaged)
    return reviewerAction(pr, requested);
  return null;
}
