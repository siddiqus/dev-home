import React from "react";
import {
  IconGitPullRequest,
  IconGitPullRequestDraft,
  IconGitBranch,
  IconExternalLink,
  IconCopy,
  IconNote,
} from "@tabler/icons-react";
import { GitHubPR, GitHubLabel } from "../types";
import { formatRelativeTime } from "../utils/time";
import { RED_CHECK_STATUSES } from "../utils/prCategories";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { ClaudeActionDropdown } from "./ClaudeActionDropdown";
import type { ClaudeAction, ClaudeSession } from "../types/claude";

/** Which optional fields a card renders, driven by the PRTable variant. */
export interface PRCardFields {
  showAuthor: boolean;
  showBranch: boolean;
  /** Render the review/merge-queue/draft status pill on the top-right. */
  showStatus: boolean;
  /** Render the CI checks icon on the top-right. */
  showChecks: boolean;
  /** "open" → opened + updated; "merged" → merged at. */
  timestamps: "open" | "merged";
}

type StatusVariant = "success" | "danger" | "warning" | "purple" | "draft";

/** Collapse the PR's various state flags into a single primary status pill. */
function deriveStatus(pr: GitHubPR): { label: string; variant: StatusVariant } {
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

type ReasonVariant = "danger" | "warning" | "info";

interface ReasonChip {
  key: string;
  label: string;
  variant: ReasonVariant;
}

/**
 * The "why does this need action" chips for a needs-action PR row, ordered most
 * blocking first: CI failure → merge conflict → non-approving review → your turn
 * → unresolved threads. Only rendered for needs-action rows (see PRCard's
 * `showReasonChips`), where at least one of the first three always applies — so
 * an empty result never reaches the UI in practice.
 */
function deriveReasonChips(pr: GitHubPR): ReasonChip[] {
  const chips: ReasonChip[] = [];

  if (pr.checks_status && RED_CHECK_STATUSES.has(pr.checks_status)) {
    chips.push({ key: "ci", label: "CI failed", variant: "danger" });
  }
  if (pr.has_conflict) {
    chips.push({ key: "conflict", label: "Merge conflict", variant: "danger" });
  }
  if (pr.review_status === "CHANGES_REQUESTED") {
    chips.push({ key: "review", label: "Changes requested", variant: "danger" });
  } else if (pr.review_status === "REVIEWED") {
    chips.push({ key: "review", label: "Reviewed", variant: "warning" });
  }
  if (pr.your_turn) {
    chips.push({ key: "turn", label: "Your turn", variant: "info" });
  }
  if (pr.unresolved_thread_count && pr.unresolved_thread_count > 0) {
    chips.push({
      key: "threads",
      label: `Unresolved (${pr.unresolved_thread_count})`,
      variant: "warning",
    });
  }

  return chips;
}

/** Unified reason-chip row shown on needs-action PR rows. */
function ReasonChips({ pr }: { pr: GitHubPR }) {
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
function renderTitleContent(
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
function BranchPill({
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
function DiffStat({ pr }: { pr: GitHubPR }) {
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
function PRLabels({ labels }: { labels: GitHubLabel[] }) {
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

interface PRCardProps {
  pr: GitHubPR;
  fields: PRCardFields;
  jiraBaseUrl?: string;
  /** Ticket key shown inline in the title (single-PR tickets only). */
  singleTicket?: string | null;
  /** Member of a multi-PR ticket cluster — adds the indent rail. */
  clustered?: boolean;
  /** Render the unified reason-chip row (needs-action rows only), replacing the
      standalone status pill and CI icon with labeled chips. */
  showReasonChips?: boolean;
  /** Number of unresolved notes on this PR — shows a note-count badge when > 0. */
  noteCount?: number;
  claudeEnabled?: boolean;
  claudeSessions?: ClaudeSession[];
  onClaudeAction?: (
    pr: {
      number: number;
      repo_full_name: string;
      title: string;
      headBranch: string;
      baseBranch: string;
    },
    action: ClaudeAction,
    customPrompt?: string,
  ) => void;
  onViewClaudeSession?: (sessionId: string) => void;
  /** Opens the PR description modal. */
  onOpen: (pr: GitHubPR) => void;
  /** Copies the given head branch name to the clipboard (surfaces a toast). */
  onCopyBranch?: (branch: string) => void;
  /** Copies the PR's GitHub URL to the clipboard (surfaces a toast). */
  onCopyLink?: (url: string) => void;
}

export function PRCard({
  pr,
  fields,
  jiraBaseUrl,
  singleTicket,
  clustered,
  showReasonChips,
  noteCount,
  claudeEnabled,
  claudeSessions,
  onClaudeAction,
  onViewClaudeSession,
  onOpen,
  onCopyBranch,
  onCopyLink,
}: PRCardProps) {
  // On needs-action rows the reason chips replace the standalone status pill (the
  // review state becomes a chip). The CI status icon stays on every row.
  const status = fields.showStatus && !showReasonChips ? deriveStatus(pr) : null;
  const timeText =
    fields.timestamps === "merged"
      ? pr.merged_at
        ? `merged ${formatRelativeTime(pr.merged_at)}`
        : "—"
      : `opened ${formatRelativeTime(pr.created_at)} · updated ${formatRelativeTime(pr.updated_at)}`;

  return (
    <div
      className={`pr-card${clustered ? " pr-card--clustered" : ""}`}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // Pointer clicks shouldn't leave a focus ring on the row (Bootstrap also
        // restores focus here when the modal closes). Blur so the ring only ever
        // shows for keyboard users, whose activation goes through onKeyDown.
        e.currentTarget.blur();
        onOpen(pr);
      }}
      onKeyDown={(e) => {
        // Only the row itself opens the PR — ignore keys bubbling up from nested
        // controls (copy button, GitHub link, branch copy) so activating them
        // with the keyboard doesn't also open the modal.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(pr);
        }
      }}
    >
      <span className={`pr-card-icon${pr.draft ? " pr-card-icon--muted" : ""}`}>
        {pr.draft ? (
          <IconGitPullRequestDraft size={20} stroke={1.8} />
        ) : (
          <IconGitPullRequest size={20} stroke={1.8} />
        )}
      </span>

      <div className="pr-card-main">
        <div className="pr-card-title">
          <span className="pr-card-title-text">
            {renderTitleContent(pr.title, singleTicket, jiraBaseUrl)}
          </span>
          <a
            className="pr-card-ext"
            href={pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open PR on GitHub"
            onClick={(e) => e.stopPropagation()}
          >
            <IconExternalLink size={14} stroke={1.8} />
          </a>
          {onCopyLink && (
            <button
              type="button"
              className="pr-card-copy-link"
              title="Copy PR link"
              aria-label="Copy PR link"
              onClick={(e) => {
                e.stopPropagation();
                onCopyLink(pr.html_url);
              }}
            >
              <IconCopy size={14} stroke={1.8} />
            </button>
          )}
        </div>

        <div className="pr-card-meta">
          <span className="pr-card-repo">
            {pr.repo_full_name}#{pr.number}
          </span>
          {fields.showAuthor && (
            <>
              <span className="pr-card-sep">{"·"}</span>
              <span className="pr-card-author">{pr.user.login}</span>
            </>
          )}
          {fields.showBranch && (
            <>
              <span className="pr-card-sep">{"·"}</span>
              <BranchPill head={pr.head.ref} base={pr.base.ref} onCopy={onCopyBranch} />
            </>
          )}
          {(typeof pr.additions === "number" || typeof pr.deletions === "number") && (
            <>
              <span className="pr-card-sep">{"·"}</span>
              <DiffStat pr={pr} />
            </>
          )}
          {fields.timestamps === "merged" && pr.merged_by && (
            <>
              <span className="pr-card-sep">{"·"}</span>
              <span className="pr-card-mergedby">merged by {pr.merged_by}</span>
            </>
          )}
          {noteCount && noteCount > 0 ? (
            <>
              <span className="pr-card-sep">{"·"}</span>
              <span
                className="pr-card-notes"
                title={`${noteCount} note${noteCount > 1 ? "s" : ""} on this PR`}
              >
                <IconNote size={12} stroke={1.8} />
                {noteCount}
              </span>
            </>
          ) : null}
          {pr.labels && pr.labels.length > 0 && <PRLabels labels={pr.labels} />}
        </div>
      </div>

      <div className="pr-card-side">
        <div className="pr-card-side-top">
          {showReasonChips && <ReasonChips pr={pr} />}
          {status &&
            (status.variant === "draft" ? (
              <span className="pr-card-draft">Draft</span>
            ) : status.variant === "purple" ? (
              <span className="pr-card-tag pr-card-tag--merge-queue">{status.label}</span>
            ) : (
              <span className="pr-card-status">
                <span className={`pr-card-dot pr-card-dot--${status.variant}`} />
                {status.label}
              </span>
            ))}
          {fields.showChecks && <ChecksStatusIcon status={pr.checks_status} />}
          {claudeEnabled && onClaudeAction && (
            <ClaudeActionDropdown
              pr={pr}
              activeSessions={claudeSessions}
              onViewSession={onViewClaudeSession}
              onAction={(action, customPrompt) =>
                onClaudeAction(
                  {
                    number: pr.number,
                    repo_full_name: pr.repo_full_name,
                    title: pr.title,
                    headBranch: pr.head.ref,
                    baseBranch: pr.base.ref,
                  },
                  action,
                  customPrompt,
                )
              }
            />
          )}
        </div>
        <div className="pr-card-time">{timeText}</div>
      </div>
    </div>
  );
}
