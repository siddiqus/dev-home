import React from "react";
import {
  IconGitPullRequest,
  IconGitPullRequestDraft,
  IconGitBranch,
  IconExternalLink,
} from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { formatRelativeTime } from "../utils/time";
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
function BranchPill({ head, base }: { head: string; base: string }) {
  const showBase = !["master", "main"].includes(base);
  return (
    <span className="pr-card-branch">
      <IconGitBranch size={12} stroke={1.8} />
      <span className="pr-card-branch-name" title={head}>
        {head}
      </span>
      {showBase && (
        <span className="pr-card-branch-arrow">
          {"→"} {base}
        </span>
      )}
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
}

export function PRCard({
  pr,
  fields,
  jiraBaseUrl,
  singleTicket,
  clustered,
  claudeEnabled,
  claudeSessions,
  onClaudeAction,
  onViewClaudeSession,
  onOpen,
}: PRCardProps) {
  const status = fields.showStatus ? deriveStatus(pr) : null;
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
              <BranchPill head={pr.head.ref} base={pr.base.ref} />
            </>
          )}
        </div>
      </div>

      <div className="pr-card-side">
        <div className="pr-card-side-top">
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
