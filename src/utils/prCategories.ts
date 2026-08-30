import type { ElementType } from "react";
import {
  IconCircleCheck,
  IconAlertTriangle,
  IconClock,
  IconGitPullRequestDraft,
} from "@tabler/icons-react";
import type { GitHubPR } from "../types";

/** The four buckets an open PR can fall into on the "My PRs" page. */
export type OpenPRSection = "ready" | "needs-action" | "pending" | "draft";

/** Check-rollup states rendered red in ChecksStatusIcon — i.e. CI is failing. */
export const RED_CHECK_STATUSES: ReadonlySet<string> = new Set([
  "FAILURE",
  "ERROR",
  "STARTUP_FAILURE",
  "TIMED_OUT",
]);

/** Review states that mean a reviewer left non-approving feedback to address. */
export const NON_APPROVING_REVIEW_STATUSES: ReadonlySet<string> = new Set([
  "CHANGES_REQUESTED",
  "REVIEWED",
]);

/** Visual weight of an actionable reason, shared by reason chips and filters. */
export type ActionableVariant = "danger" | "warning" | "info";

/**
 * A single "why this PR needs attention" signal. This is the one source of truth
 * for both the reason chips on a PR card (see PRCard's `deriveReasonChips`) and
 * the sidebar's "Actionable" filter — so a new signal added here shows up in both
 * places. Ordered most-blocking first; that order drives the chip display order.
 */
export interface ActionableReason {
  /** Stable identifier, used as the filter value and the chip's React key. */
  key: string;
  /** Human label for the filter option and (usually) the chip text. */
  label: string;
  variant: ActionableVariant;
  /** Whether this signal currently applies to the given PR. */
  matches: (pr: GitHubPR) => boolean;
}

export const ACTIONABLE_REASONS: readonly ActionableReason[] = [
  {
    key: "ci_failed",
    label: "CI failed",
    variant: "danger",
    matches: (pr) => !!pr.checks_status && RED_CHECK_STATUSES.has(pr.checks_status),
  },
  {
    key: "conflict",
    label: "Merge conflict",
    variant: "danger",
    matches: (pr) => !!pr.has_conflict,
  },
  {
    key: "changes_requested",
    label: "Changes requested",
    variant: "danger",
    matches: (pr) => pr.review_status === "CHANGES_REQUESTED",
  },
  {
    key: "reviewed",
    label: "Reviewed",
    variant: "warning",
    matches: (pr) => pr.review_status === "REVIEWED",
  },
  {
    key: "your_turn",
    label: "Your turn",
    variant: "info",
    matches: (pr) => !!pr.your_turn,
  },
  {
    key: "unresolved",
    label: "Unresolved threads",
    variant: "warning",
    matches: (pr) => !!pr.unresolved_thread_count && pr.unresolved_thread_count > 0,
  },
];

/**
 * Assign an open PR to exactly one section. Rules are evaluated top-down and the
 * first match wins, which encodes two decisions:
 *   - drafts are pulled out first (a draft can never be "ready to merge"), and
 *   - "needs action" beats "ready to merge" (an approved PR with red CI needs work).
 */
export function categorizeOpenPR(pr: GitHubPR): OpenPRSection {
  if (pr.draft) return "draft";

  const redChecks = !!pr.checks_status && RED_CHECK_STATUSES.has(pr.checks_status);
  const nonApprovingReview =
    !!pr.review_status && NON_APPROVING_REVIEW_STATUSES.has(pr.review_status);
  if (redChecks || nonApprovingReview) return "needs-action";

  if (pr.in_merge_queue || pr.review_status === "APPROVED") return "ready";

  return "pending";
}

/** Group a list of open PRs by section, preserving input order within each bucket. */
export function groupPRsBySection(prs: GitHubPR[]): Record<OpenPRSection, GitHubPR[]> {
  const groups: Record<OpenPRSection, GitHubPR[]> = {
    ready: [],
    "needs-action": [],
    pending: [],
    draft: [],
  };
  for (const pr of prs) {
    groups[categorizeOpenPR(pr)].push(pr);
  }
  return groups;
}

/** Presentation metadata for each section, in display order. */
export interface OpenPRSectionMeta {
  id: OpenPRSection;
  label: string;
  icon: ElementType;
  /** CSS custom property used to tint the section's icon. */
  colorVar: string;
}

export const OPEN_PR_SECTIONS: readonly OpenPRSectionMeta[] = [
  {
    id: "ready",
    label: "Ready to merge",
    icon: IconCircleCheck,
    colorVar: "--color-status-success",
  },
  {
    id: "needs-action",
    label: "Needs action",
    icon: IconAlertTriangle,
    colorVar: "--color-status-danger",
  },
  { id: "pending", label: "Pending review", icon: IconClock, colorVar: "--color-text-secondary" },
  { id: "draft", label: "Drafts", icon: IconGitPullRequestDraft, colorVar: "--color-text-muted" },
];
