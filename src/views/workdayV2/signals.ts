import type { GitHubPR } from "../../types";
import type { BadgeVariant } from "../../components/primitives/Badge";
import type { Signal } from "./types";
import { diffSize } from "../workday/buildFocus";
import { readyToMerge, ciFailing } from "../workday/prState";
import { compactAge } from "../workday/dates";
import { RED_CHECK_STATUSES, noReviewer } from "../../utils/prCategories";

/** Get just the check names that are failing, formatted. */
function failingCheckNames(pr: GitHubPR): string {
  const names = [
    ...new Set(pr.checks.filter((c) => RED_CHECK_STATUSES.has(c.status)).map((c) => c.name)),
  ];
  if (names.length === 0) return "CI";
  const shown = names.slice(0, 2).join(" + ");
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown;
}

/** Maximum number of signal chips to show before "+N". */
export const MAX_CHIPS = 4;

/** Priority of each badge variant (lower = needs me more). */
export const PRIORITY: Record<BadgeVariant, number> = {
  danger: 0,
  warning: 1,
  info: 2,
  success: 3,
  purple: 4,
  neutral: 5,
};

/**
 * Signals for my own PRs, worst first. Spec §5.5 "My PRs" table.
 * Reuses v1's readyToMerge and ciFailing (prState), noReviewer and RED_CHECK_STATUSES
 * (prCategories) and diffSize so v1 and v2 agree on the underlying facts. It does
 * not call v1's selfNeeds: the chips and their wording are built here.
 */
export function mySignals(pr: GitHubPR, now: Date): Signal[] {
  const signals: Signal[] = [];

  // CI failing (danger)
  if (ciFailing(pr)) {
    signals.push({ label: `✗ CI failing: ${failingCheckNames(pr)}`, tone: "danger" });
  }

  // Conflict (danger)
  if (pr.has_conflict) {
    signals.push({ label: `✗ Conflict with ${pr.base.ref}`, tone: "danger" });
  }

  // Changes requested (danger)
  if (pr.review_status === "CHANGES_REQUESTED") {
    const threadCount = pr.unresolved_thread_count ?? 0;
    const threadPart =
      threadCount > 0 ? ` · ${threadCount} ${threadCount === 1 ? "thread" : "threads"}` : "";
    signals.push({ label: `✗ Changes requested${threadPart}`, tone: "danger" });
  }
  // Open threads (warning) - only when not already in Changes requested
  else if ((pr.unresolved_thread_count ?? 0) > 0) {
    const count = pr.unresolved_thread_count!;
    signals.push({ label: `${count} open ${count === 1 ? "thread" : "threads"}`, tone: "warning" });
  }

  // No reviewer (warning) - only for non-drafts
  if (!pr.draft && noReviewer(pr)) {
    signals.push({ label: "No reviewer", tone: "warning" });
  }

  // Ready to merge (success)
  if (readyToMerge(pr)) {
    signals.push({ label: "✓ Ready to merge", tone: "success" });
  }
  // Approved but not ready (success)
  else if (pr.review_status === "APPROVED") {
    // Find who approved (we don't have that in GitHubPR currently, so just use generic)
    signals.push({ label: "✓ Approved", tone: "success" });
  }

  // In merge queue (purple)
  if (pr.in_merge_queue) {
    signals.push({ label: "In merge queue", tone: "purple" });
  }

  // Waiting on reviewers (neutral)
  const reviewers = pr.requested_reviewers ?? [];
  if (
    !pr.draft &&
    reviewers.length > 0 &&
    !ciFailing(pr) &&
    !pr.has_conflict &&
    pr.review_status !== "CHANGES_REQUESTED" &&
    pr.review_status !== "APPROVED" &&
    !pr.in_merge_queue &&
    (pr.unresolved_thread_count ?? 0) === 0 &&
    !noReviewer(pr)
  ) {
    const age = compactAge(pr.created_at, now);
    signals.push({ label: `⏳ Waiting on ${reviewers.join(", ")} · ${age}`, tone: "neutral" });
  }

  // Draft (neutral)
  if (pr.draft) {
    signals.push({ label: "Draft", tone: "neutral" });
  }

  // CI context (neutral) - never the only chip
  if (pr.checks_status) {
    if (pr.checks_status === "SUCCESS") {
      signals.push({ label: "CI ✓", tone: "neutral" });
    } else if (pr.checks_status === "PENDING") {
      signals.push({ label: "CI …", tone: "neutral" });
    }
  }

  // Sort by priority (worst first)
  return signals.sort((a, b) => PRIORITY[a.tone] - PRIORITY[b.tone]);
}

/**
 * Signals for PRs I'm reviewing. Spec §5.5 "PRs I'm reviewing" table.
 * Draft PRs suppress all review signals.
 */
export function reviewSignals(pr: GitHubPR, requested: boolean): Signal[] {
  // Draft suppresses all review signals
  if (pr.draft) {
    return [];
  }

  const signals: Signal[] = [];

  // Re-requested (warning)
  if (requested && pr.viewer_engaged) {
    signals.push({ label: `Re-requested by ${pr.user.login}`, tone: "warning" });
  }

  // New commits since non-approving review (warning)
  if (pr.new_commits_since_review && pr.viewer_review_state !== "APPROVED") {
    signals.push({ label: "New commits since your review", tone: "warning" });
  }

  // Review requested with diff size (info)
  if (requested && !pr.viewer_engaged) {
    signals.push({ label: `Review requested${diffSize(pr)}`, tone: "info" });
  }

  return signals;
}

/**
 * Priority of a PR based on its worst signal. Returns neutral priority if no signals.
 * CI context signals (neutral CI ✓ / CI …) are ignored when finding the worst.
 */
export function prPriority(signals: Signal[]): number {
  const nonContextSignals = signals.filter((s) => !s.label.startsWith("CI "));
  if (nonContextSignals.length === 0) {
    return PRIORITY.neutral;
  }
  return Math.min(...nonContextSignals.map((s) => PRIORITY[s.tone]));
}

/**
 * Split signals at MAX_CHIPS: first N shown, rest in overflow.
 * Returns { shown: Signal[], more: Signal[] }.
 */
export function visibleChips(signals: Signal[]): { shown: Signal[]; more: Signal[] } {
  if (signals.length <= MAX_CHIPS) {
    return { shown: signals, more: [] };
  }
  return {
    shown: signals.slice(0, MAX_CHIPS),
    more: signals.slice(MAX_CHIPS),
  };
}

/**
 * The label of the worst non-context signal, for the rail status line.
 * Returns empty string if no non-context signals.
 */
export function headline(signals: Signal[]): string {
  const nonContextSignals = signals.filter((s) => !s.label.startsWith("CI "));
  if (nonContextSignals.length === 0) {
    return "";
  }
  // Signals are already sorted worst-first
  return nonContextSignals[0].label;
}
