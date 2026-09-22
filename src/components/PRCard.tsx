import { IconExternalLink, IconCopy, IconNote } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { formatRelativeTime } from "../utils/time";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { ClaudeActionDropdown } from "./ClaudeActionDropdown";
import {
  BranchPill,
  DiffStat,
  PRLabels,
  PRStateIcon,
  ReasonChips,
  StatusPill,
  renderTitleContent,
} from "./prIndicators";
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
  const showStatusPill = fields.showStatus && !showReasonChips;
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
      <PRStateIcon pr={pr} size={20} />

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
          {showStatusPill && <StatusPill pr={pr} />}
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
