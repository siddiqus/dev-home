import React, { useState, useEffect, useRef } from "react";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import {
  IconGitPullRequest,
  IconEye,
  IconBuilding,
  IconChevronRight,
  IconChevronDown,
  IconExternalLink,
} from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../types";
import { formatRelativeTime } from "../utils/time";
import { groupByTicket } from "../utils/tickets";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { DescriptionModal } from "./DescriptionModal";
import { EmptyState } from "./EmptyState";
import { Badge, BadgeVariant } from "./primitives/Badge";
import { BranchTag } from "./primitives/BranchTag";
import { Avatar } from "./primitives/Avatar";
import { ClaudeActionDropdown } from "./ClaudeActionDropdown";
import type { ClaudeAction, ClaudeSession } from "../types/claude";
import "./PRTable.css";

const REVIEW_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  APPROVED: { label: "Approved", variant: "success" },
  CHANGES_REQUESTED: { label: "Changes Requested", variant: "danger" },
  REVIEWED: { label: "Reviewed", variant: "warning" },
};

type PRTableVariant =
  | "my-prs"
  | "review-requests"
  | "org-prs"
  | "recently-merged"
  | "recently-merged-org";

interface PRTableProps {
  prs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
  jiraBaseUrl?: string;
  variant: PRTableVariant;
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
}

/** Column definitions per variant. */
const VARIANT_CONFIG: Record<
  PRTableVariant,
  {
    columns: string[];
    emptyIcon: React.ReactNode;
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  "my-prs": {
    columns: ["title", "repo", "branch", "status", "created", "updated"],
    emptyIcon: <IconGitPullRequest size={40} stroke={1.5} />,
    emptyTitle: "No open pull requests",
    emptyDescription: "You don't have any open pull requests at the moment.",
  },
  "review-requests": {
    columns: ["title", "repo", "author", "checks", "created", "updated"],
    emptyIcon: <IconEye size={40} stroke={1.5} />,
    emptyTitle: "No review requests",
    emptyDescription: "No one has requested your review on any pull requests.",
  },
  "org-prs": {
    columns: ["title", "repo", "branch", "author", "status", "created", "updated"],
    emptyIcon: <IconBuilding size={40} stroke={1.5} />,
    emptyTitle: "No org pull requests",
    emptyDescription: "No open, non-draft pull requests found for this org.",
  },
  "recently-merged": {
    columns: ["title", "repo", "branch", "merged"],
    emptyIcon: <IconGitPullRequest size={40} stroke={1.5} />,
    emptyTitle: "No recently merged PRs",
    emptyDescription: "No pull requests have been merged recently.",
  },
  "recently-merged-org": {
    columns: ["title", "repo", "branch", "author", "merged"],
    emptyIcon: <IconGitPullRequest size={40} stroke={1.5} />,
    emptyTitle: "No recently merged PRs",
    emptyDescription: "No pull requests have been merged recently.",
  },
};

const HEADER_LABELS: Record<string, string> = {
  pr: "PR",
  title: "Title",
  repo: "Repository",
  branch: "Branch",
  author: "Author",
  checks: "Checks",
  status: "Status",
  created: "Created",
  updated: "Updated",
  merged: "Merged at",
};

const COLUMN_WIDTHS: Record<PRTableVariant, Record<string, string>> = {
  "my-prs": {
    title: "30%",
    repo: "22%",
    branch: "20%",
    status: "16%",
    created: "6%",
    updated: "6%",
  },
  "review-requests": {
    title: "32%",
    repo: "22%",
    author: "16%",
    checks: "10%",
    created: "10%",
    updated: "10%",
  },
  "org-prs": {
    title: "24%",
    repo: "20%",
    branch: "18%",
    author: "12%",
    status: "14%",
    created: "5%",
    updated: "5%",
  },
  "recently-merged": {
    title: "35%",
    repo: "22%",
    branch: "28%",
    merged: "15%",
  },
  "recently-merged-org": {
    title: "28%",
    repo: "18%",
    branch: "22%",
    author: "15%",
    merged: "17%",
  },
};

/** Render a single cell by column key. */
function renderCell(
  col: string,
  pr: GitHubPR,
  opts: { isGrouped: boolean; isFirstColumn: boolean },
): React.ReactNode {
  const indentStyle = opts.isGrouped && opts.isFirstColumn ? { paddingLeft: 30 } : undefined;
  switch (col) {
    case "title":
      return (
        <td key={col} className="cell-truncate" style={indentStyle}>
          <a
            href={pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-truncate-custom d-block"
            style={{ fontWeight: 500 }}
            onClick={(e) => e.stopPropagation()}
          >
            {pr.title}
          </a>
        </td>
      );
    case "repo":
      return (
        <td key={col} className="cell-truncate">
          <Badge variant="neutral" className="fw-bold" size="md">
            {pr.repo_full_name}
          </Badge>
        </td>
      );
    case "branch":
      return (
        <td key={col} className="cell-truncate">
          <div className="d-flex align-items-center gap-1" style={{ minWidth: 0 }}>
            <BranchTag name={pr.head.ref} />
            {!["master", "main"].includes(pr.base.ref) && (
              <>
                <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                  {"\u2192"}
                </span>
                <BranchTag name={pr.base.ref} />
              </>
            )}
          </div>
        </td>
      );
    case "author":
      return (
        <td key={col}>
          <div className="d-flex align-items-center gap-2">
            <Avatar src={pr.user.avatar_url} alt={pr.user.login} size="sm" />
            <span style={{ fontSize: "0.8125rem" }}>{pr.user.login}</span>
          </div>
        </td>
      );
    case "checks":
      return (
        <td key={col}>
          <ChecksStatusIcon status={pr.checks_status} />
        </td>
      );
    case "status":
      return (
        <td key={col}>
          <div className="d-flex align-items-center gap-2">
            {pr.draft ? (
              <Badge variant="neutral">Draft</Badge>
            ) : (
              <Badge variant="success">Open</Badge>
            )}
            <ChecksStatusIcon status={pr.checks_status} />
            {pr.review_status && REVIEW_STATUS_CONFIG[pr.review_status] && (
              <Badge variant={REVIEW_STATUS_CONFIG[pr.review_status].variant}>
                {REVIEW_STATUS_CONFIG[pr.review_status].label}
              </Badge>
            )}
          </div>
        </td>
      );
    case "created":
      return (
        <td key={col}>
          <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
            {formatRelativeTime(pr.created_at)}
          </span>
        </td>
      );
    case "updated":
      return (
        <td key={col}>
          <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
            {formatRelativeTime(pr.updated_at)}
          </span>
        </td>
      );
    case "merged":
      return (
        <td key={col}>
          <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
            {pr.merged_at ? formatRelativeTime(pr.merged_at) : "—"}
          </span>
        </td>
      );
    default:
      return <td key={col} />;
  }
}

export const PRTable: React.FC<PRTableProps> = ({
  prs,
  loading,
  jiraIssues = [],
  jiraBaseUrl = "",
  variant,
  claudeEnabled,
  claudeSessions,
  onClaudeAction,
  onViewClaudeSession,
}) => {
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Reset collapse state when the PR data changes (e.g. after refresh)
  const prevPrsRef = useRef(prs);
  useEffect(() => {
    if (prevPrsRef.current !== prs) {
      prevPrsRef.current = prs;
      setCollapsed(new Set());
    }
  }, [prs]);

  const isMergedVariant = variant === "recently-merged" || variant === "recently-merged-org";
  const config = VARIANT_CONFIG[variant];
  const { columns } = config;

  if (loading && prs.length === 0) {
    if (isMergedVariant) return null;
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (prs.length === 0) {
    if (isMergedVariant) return null;
    return (
      <EmptyState
        icon={config.emptyIcon}
        title={config.emptyTitle}
        description={config.emptyDescription}
      />
    );
  }

  const ticketTitles = new Map(jiraIssues.map((issue) => [issue.key.toUpperCase(), issue.summary]));

  const toggleGroup = (ticket: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(ticket)) {
        next.delete(ticket);
      } else {
        next.add(ticket);
      }
      return next;
    });
  };

  const groups = groupByTicket(prs);

  return (
    <>
      <Table hover style={{ tableLayout: "fixed" }}>
        <colgroup>
          {columns.map((col) => (
            <col key={col} style={{ width: COLUMN_WIDTHS[variant]?.[col] }} />
          ))}
          {claudeEnabled && onClaudeAction && <col style={{ width: "80px" }} />}
        </colgroup>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{HEADER_LABELS[col] || col}</th>
            ))}
            {claudeEnabled && onClaudeAction && <th />}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, groupIdx) => {
            const isGroup = group.ticket !== null && group.prs.length > 1;
            const isCollapsed = isGroup && collapsed.has(group.ticket!);
            const groupKey = group.ticket ?? `ungrouped-${groupIdx}`;
            return (
              <React.Fragment key={groupKey}>
                {isGroup && (
                  <tr className="ticket-group-header" onClick={() => toggleGroup(group.ticket!)}>
                    <td colSpan={columns.length + (claudeEnabled && onClaudeAction ? 1 : 0)}>
                      <span className="ticket-group-chevron">
                        {isCollapsed ? (
                          <IconChevronRight size={14} stroke={2} />
                        ) : (
                          <IconChevronDown size={14} stroke={2} />
                        )}
                      </span>
                      <span className="ticket-group-label">{group.ticket}</span>

                      {ticketTitles.get(group.ticket!.toUpperCase()) && (
                        <span className="ticket-group-title">
                          {ticketTitles.get(group.ticket!.toUpperCase())}
                        </span>
                      )}

                      <span className="ticket-group-count">{group.prs.length} PRs</span>

                      {jiraBaseUrl && (
                        <a
                          href={`${jiraBaseUrl.replace(/\/+$/, "")}/browse/${group.ticket}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ticket-group-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconExternalLink size={14} stroke={1.5} />
                        </a>
                      )}
                    </td>
                  </tr>
                )}
                {!isCollapsed &&
                  group.prs.map((pr, index) => (
                    <tr
                      key={pr.id}
                      onClick={() => setSelectedPR(pr)}
                      style={{
                        cursor: "pointer",
                      }}
                    >
                      {columns.map((col, colIdx) =>
                        renderCell(col, pr, { isGrouped: !!isGroup, isFirstColumn: colIdx === 0 }),
                      )}
                      {claudeEnabled && onClaudeAction && (
                        <td>
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
                        </td>
                      )}
                    </tr>
                  ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </Table>

      <DescriptionModal
        show={!!selectedPR}
        onHide={() => setSelectedPR(null)}
        title={selectedPR ? `#${selectedPR.number} ${selectedPR.title}` : ""}
        subtitle={`${selectedPR?.user.login} · ${selectedPR?.repo_full_name} · ${selectedPR?.head.ref} · ${formatRelativeTime(selectedPR?.created_at || "")}`}
        description={selectedPR?.body || ""}
        url={selectedPR?.html_url}
        checks={selectedPR?.checks}
        activeSessions={
          selectedPR
            ? claudeSessions?.filter(
                (s) =>
                  s.prNumber === selectedPR.number &&
                  s.repoFullName === selectedPR.repo_full_name &&
                  s.status === "running",
              )
            : undefined
        }
        onViewSession={onViewClaudeSession}
        pr={selectedPR ?? undefined}
        claudeEnabled={claudeEnabled}
        onClaudeAction={
          selectedPR && onClaudeAction
            ? (action, customPrompt) =>
                onClaudeAction(
                  {
                    number: selectedPR.number,
                    repo_full_name: selectedPR.repo_full_name,
                    title: selectedPR.title,
                    headBranch: selectedPR.head.ref,
                    baseBranch: selectedPR.base.ref,
                  },
                  action,
                  customPrompt,
                )
            : undefined
        }
      />
    </>
  );
};
