import React from "react";
import {
  IconGitPullRequest,
  IconGitPullRequestDraft,
  IconGitBranch,
  IconCopy,
} from "@tabler/icons-react";
import { GitHubPR, GitHubLabel } from "../types";
import { ACTIONABLE_REASONS, type ActionableVariant } from "../utils/prCategories";
import "./prIndicators.css";

/**
 * Shared presentational pieces for a PR's labels and status indicators, used by
 * both the PR list row ({@link PRCard}) and the PR detail modal
 * ({@link DescriptionModal}). Keeping them in one module is what guarantees the
 * two views show the *same* indicators — change a chip here and both update.
 */

type StatusVariant = "success" | "danger" | "warning" | "purple" | "draft";

/** Collapse the PR's various state flags into a single primary status pill. */
export function deriveStatus(pr: GitHubPR): { label: string; variant: StatusVariant } {
  if (pr.in_merge_queue) return { label: "In Merge Queue", variant: "purple" };
  if (pr.draft) return { label: "Draft", variant: "draft" };
  switch (pr.review_status) {
    case "APPROVED":
      return { label: "Approved", variant: "success" };
    case "CHANGES_REQUESTED":
      return { label: "Changes requested", variant: "danger" };
    case "REVIEWED":
      return { label: "Reviewed", variant: "warning" };
    default:
      return { label: "Awaiting review", variant: "warning" };
  }
}

/** The single primary status pill: draft chip, merge-queue tag, or dot + label. */
export function StatusPill({ pr }: { pr: GitHubPR }) {
  const status = deriveStatus(pr);
  if (status.variant === "draft") return <span className="pr-card-draft">Draft</span>;
  if (status.variant === "purple")
    return <span className="pr-card-tag pr-card-tag--merge-queue">{status.label}</span>;
  return (
    <span className="pr-card-status">
      <span className={`pr-card-dot pr-card-dot--${status.variant}`} />
      {status.label}
    </span>
  );
}

interface ReasonChip {
  key: string;
  label: string;
  variant: ActionableVariant;
}

/**
 * The "why does this need action" chips for a needs-action PR, derived from the
 * shared {@link ACTIONABLE_REASONS} list (the same source the sidebar's
 * Actionable filter uses) so the two never drift. Reasons are already ordered
 * most-blocking first there; the unresolved-threads chip appends its live count.
 * Only meaningful for needs-action PRs, where at least one reason always applies
 * — an empty result renders nothing.
 */
function deriveReasonChips(pr: GitHubPR): ReasonChip[] {
  return ACTIONABLE_REASONS.filter((reason) => reason.matches(pr)).map((reason) => ({
    key: reason.key,
    label:
      reason.key === "unresolved" ? `Unresolved (${pr.unresolved_thread_count})` : reason.label,
    variant: reason.variant,
  }));
}

/** Unified reason-chip row shown on needs-action PRs. */
export function ReasonChips({ pr }: { pr: GitHubPR }) {
  const chips = deriveReasonChips(pr);
  if (chips.length === 0) return null;
  return (
    <div className="pr-card-reasons">
      {chips.map((chip) => (
        <span key={chip.key} className={`pr-reason-chip pr-reason-chip--${chip.variant}`}>
          {chip.label}
        </span>
      ))}
    </div>
  );
}

/** The leading PR icon — draft (muted) vs open. */
export function PRStateIcon({ pr, size = 20 }: { pr: GitHubPR; size?: number }) {
  return (
    <span className={`pr-card-icon${pr.draft ? " pr-card-icon--muted" : ""}`}>
      {pr.draft ? (
        <IconGitPullRequestDraft size={size} stroke={1.8} />
      ) : (
        <IconGitPullRequest size={size} stroke={1.8} />
      )}
    </span>
  );
}

/** Anchor to a Jira ticket, or a plain span when there's no Jira base URL. */
function TicketAnchor({
  ticket,
  jiraBaseUrl,
  children,
}: {
  ticket: string;
  jiraBaseUrl?: string;
  children: React.ReactNode;
}) {
  if (!jiraBaseUrl) return <span className="pr-card-ticket">{children}</span>;
  return (
    <a
      className="pr-card-ticket"
      href={`${jiraBaseUrl.replace(/\/+$/, "")}/browse/${ticket}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  );
}

/**
 * Render the title with its Jira ticket linked. When the title already contains
 * the ticket key, that occurrence is turned into the link in place — no
 * duplicated "PROJ-1: PROJ-1: …". When the ticket was derived from the branch
 * (not present in the title), it's prepended so it stays visible.
 */
export function renderTitleContent(
  title: string,
  ticket: string | null | undefined,
  jiraBaseUrl?: string,
): React.ReactNode {
  if (!ticket) return title;
  const idx = title.toUpperCase().indexOf(ticket.toUpperCase());
  if (idx === -1) {
    return (
      <>
        <TicketAnchor ticket={ticket} jiraBaseUrl={jiraBaseUrl}>
          {ticket}
        </TicketAnchor>
        {`: ${title}`}
      </>
    );
  }
  return (
    <>
      {title.slice(0, idx)}
      <TicketAnchor ticket={ticket} jiraBaseUrl={jiraBaseUrl}>
        {title.slice(idx, idx + ticket.length)}
      </TicketAnchor>
      {title.slice(idx + ticket.length)}
    </>
  );
}

/** head → base branch pill; base is hidden when it's the default branch. */
export function BranchPill({
  head,
  base,
  onCopy,
}: {
  head: string;
  base: string;
  onCopy?: (branch: string) => void;
}) {
  const showBase = !["master", "main"].includes(base);
  return (
    <span className="pr-card-branch">
      <IconGitBranch size={12} stroke={1.8} />
      <span className="pr-card-branch-name" title={head}>
        {head}
      </span>
      {onCopy && (
        <button
          type="button"
          className="pr-card-branch-copy"
          title="Copy branch name"
          aria-label="Copy branch name"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(head);
          }}
        >
          <IconCopy size={12} stroke={1.8} />
        </button>
      )}
      {showBase && (
        <span className="pr-card-branch-arrow">
          {"→"} {base}
        </span>
      )}
    </span>
  );
}

/**
 * Style a label badge with its GitHub color, picking dark or light text based on
 * the color's perceived luminance so the name stays readable on any background.
 * Falls back to CSS defaults when the color is missing or malformed.
 */
function labelStyle(color: string): React.CSSProperties {
  const hex = (color || "").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return {};
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return {
    backgroundColor: `#${hex}`,
    color: luminance > 0.6 ? "#1b1f24" : "#ffffff",
  };
}

/**
 * Diff summary for a PR: additions (green), deletions (red), and file count.
 * Renders nothing when the counts weren't fetched (older cached PRs, or endpoints
 * that don't populate them) — guards on additions/deletions being real numbers.
 */
export function DiffStat({ pr }: { pr: GitHubPR }) {
  if (typeof pr.additions !== "number" || typeof pr.deletions !== "number") return null;
  const files = pr.changed_files;
  return (
    <span
      className="pr-card-diffstat"
      title={`${pr.additions} additions, ${pr.deletions} deletions${
        typeof files === "number" ? `, ${files} file${files === 1 ? "" : "s"} changed` : ""
      }`}
    >
      <span className="pr-card-diffstat-add">+{pr.additions}</span>
      <span className="pr-card-diffstat-del">
        {"−"}
        {pr.deletions}
      </span>
      {typeof files === "number" && (
        <span className="pr-card-diffstat-files">
          {"·"} {files} file{files === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}

/** Small colored pills for the PR's GitHub labels. */
export function PRLabels({ labels }: { labels: GitHubLabel[] }) {
  return (
    <span className="pr-card-labels">
      {labels.map((label) => (
        <span
          key={label.name}
          className="pr-card-label"
          style={labelStyle(label.color)}
          title={label.name}
        >
          {label.name}
        </span>
      ))}
    </span>
  );
}
