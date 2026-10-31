import type { GitHubPR } from "../../types";
import type { BadgeVariant } from "../../components/primitives/Badge";
import type { Signal } from "./deckTypes";
import { diffSize } from "./buildFocus";
import { authorAction, reviewerAction } from "../../utils/prAction";
import { compactAge } from "./dates";
import { noReviewer, RED_CHECK_STATUSES } from "../../utils/prCategories";

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
 * Signals for my own PRs. The first chip is always the next step (authorAction),
 * so a card is never blank; the rest are facts that step doesn't already say,
 * worst first: other blockers, the review state a blocker hides, open threads,
 * failing non-required checks.
 */
export function mySignals(pr: GitHubPR, now: Date): Signal[] {
  const action = authorAction(pr);
  let label = action.label;
  if (action.key === "ci_failed") label = `✗ Fix CI: ${failingCheckNames(pr)}`;
  else if (action.tone === "danger") label = `✗ ${label}`;
  else if (action.key === "merge" || action.key === "approved") label = `✓ ${label}`;
  else if (action.key === "waiting") label = `⏳ ${label} · ${compactAge(pr.created_at, now)}`;

  // Review feedback is answered on the PR's conversation, so those chips link there.
  const onPR = { href: pr.html_url };
  const feedback = action.key === "your_turn" || action.key === "changes_requested";
  // Red CI or a conflict takes the step, hiding where review stands.
  const blocked = action.key === "ci_failed" || action.key === "conflict";

  const facts: Signal[] = [];
  if (action.key !== "conflict" && pr.has_conflict) {
    facts.push({ label: `✗ Conflict with ${pr.base.ref}`, tone: "danger" });
  }
  if (action.key !== "changes_requested" && pr.review_status === "CHANGES_REQUESTED") {
    facts.push({ label: "✗ Changes requested", tone: "danger", ...onPR });
  }
  if (blocked && pr.review_status === "REVIEWED") {
    facts.push({ label: "Reviewed", tone: "warning", ...onPR });
  }
  const threads = pr.unresolved_thread_count ?? 0;
  if (threads > 0 && !action.label.includes("open thread")) {
    facts.push({
      label: `${threads} open ${threads === 1 ? "thread" : "threads"}`,
      tone: "warning",
      ...onPR,
    });
  }
  if (blocked && !pr.draft && noReviewer(pr)) {
    facts.push({ label: "No reviewer", tone: "warning" });
  }
  const optional = pr.optional_checks_failing ?? [];
  if (optional.length > 0) {
    const shown = optional.slice(0, 2).join(" + ");
    facts.push({
      label: `⚠ ${optional.length > 2 ? `${shown} +${optional.length - 2}` : shown} failing (not required)`,
      tone: "warning",
      detail: optional.join(", "),
    });
  }
  facts.sort((a, b) => PRIORITY[a.tone] - PRIORITY[b.tone]);
  return [{ label, tone: action.tone, ...(feedback && onPR) }, ...facts];
}

/** A merged PR's one chip: when it merged, and by whom. */
export function mergedSignal(pr: GitHubPR, now: Date): Signal {
  const age = compactAge(pr.merged_at ?? pr.updated_at, now);
  const by = pr.merged_by ? ` by ${pr.merged_by}` : "";
  return { label: `Merged ${age === "now" ? "just now" : `${age} ago`}${by}`, tone: "purple" };
}

/**
 * Signals for PRs I'm reviewing: the next step (reviewerAction) as the only
 * chip, never blank. A fresh request carries the diff size.
 */
export function reviewSignals(pr: GitHubPR, requested: boolean): Signal[] {
  const action = reviewerAction(pr, requested);
  const label = action.key === "requested" ? `${action.label}${diffSize(pr)}` : action.label;
  return [{ label, tone: action.tone }];
}

/**
 * Priority of a PR based on its worst signal. Returns neutral priority if no signals.
 */
export function prPriority(signals: Signal[]): number {
  if (signals.length === 0) {
    return PRIORITY.neutral;
  }
  return Math.min(...signals.map((s) => PRIORITY[s.tone]));
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
 * The label of the worst signal, for the rail status line.
 * Returns empty string if no signals.
 */
export function headline(signals: Signal[]): string {
  // Signals are already sorted worst-first
  return signals[0]?.label ?? "";
}
