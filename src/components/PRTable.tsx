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
import { extractTicket, groupByTicket } from "../utils/tickets";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { DescriptionModal } from "./DescriptionModal";
import { EmptyState } from "./EmptyState";
import { Badge, BadgeVariant } from "./primitives/Badge";
import { BranchTag } from "./primitives/BranchTag";
import { Avatar } from "./primitives/Avatar";
import "./PRTable.css";

const REVIEW_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  APPROVED: { label: "Approved", variant: "success" },
  CHANGES_REQUESTED: { label: "Changes Requested", variant: "danger" },
  REVIEWED: { label: "Reviewed", variant: "warning" },
};

type PRTableVariant = "my-prs" | "review-requests" | "org-prs";

interface PRTableProps {
  prs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
  jiraBaseUrl?: string;
  variant: PRTableVariant;
}

/** Column definitions per variant. */
const VARIANT_CONFIG: Record<
  PRTableVariant,
  {
    columns: string[];
    emptyIcon: React.ReactNode;
    emptyTitle: string;
    emptyDescription: string;
    grouped: boolean;
  }
> = {
  "my-prs": {
    columns: ["pr", "title", "repo", "branch", "status", "updated"],
    emptyIcon: <IconGitPullRequest size={40} stroke={1.5} />,
    emptyTitle: "No open pull requests",
    emptyDescription: "You don't have any open pull requests at the moment.",
    grouped: true,
  },
  "review-requests": {
    columns: ["title", "repo", "author", "checks", "updated"],
    emptyIcon: <IconEye size={40} stroke={1.5} />,
    emptyTitle: "No review requests",
    emptyDescription: "No one has requested your review on any pull requests.",
    grouped: true,
  },
  "org-prs": {
    columns: ["ticket", "title", "repo", "author", "status", "updated"],
    emptyIcon: <IconBuilding size={40} stroke={1.5} />,
    emptyTitle: "No org pull requests",
    emptyDescription: "No open, non-draft pull requests found for this org.",
    grouped: false,
  },
};

const HEADER_LABELS: Record<string, string> = {
  pr: "PR",
  ticket: "Ticket",
  title: "Title",
  repo: "Repository",
  branch: "Branch",
  author: "Author",
  checks: "Checks",
  status: "Status",
  updated: "Updated",
};

/** Render a single cell by column key. */
function renderCell(
  col: string,
  pr: GitHubPR,
  opts: { isGrouped: boolean; jiraBaseUrl: string },
): React.ReactNode {
  switch (col) {
    case "pr":
      return (
        <td key={col} style={opts.isGrouped ? { paddingLeft: 30 } : undefined}>
          <a
            href={pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary-custom"
            style={{ fontWeight: 500, whiteSpace: "nowrap" }}
            onClick={(e) => e.stopPropagation()}
          >
            #{pr.number}
          </a>
        </td>
      );
    case "ticket": {
      const ticket = extractTicket(pr.title);
      const base = opts.jiraBaseUrl.replace(/\/+$/, "");
      return (
        <td key={col}>
          {ticket ? (
            <a
              href={`${base}/browse/${ticket}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-secondary-custom"
              style={{ fontWeight: 500, whiteSpace: "nowrap" }}
              onClick={(e) => e.stopPropagation()}
            >
              {ticket}
            </a>
          ) : (
            <span className="text-secondary-custom">-</span>
          )}
        </td>
      );
    }
    case "title":
      return (
        <td key={col}>
          <a
            href={pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-truncate-custom d-block"
            style={{ fontWeight: 500, maxWidth: 360 }}
            onClick={(e) => e.stopPropagation()}
          >
            {pr.title}
          </a>
        </td>
      );
    case "repo":
      return (
        <td key={col}>
          <Badge variant="neutral" className="fw-bold">
            {pr.repo_full_name}
          </Badge>
        </td>
      );
    case "branch":
      return (
        <td key={col}>
          <div className="d-flex align-items-center gap-1">
            <BranchTag name={pr.head.ref} />
            <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
              {"\u2192"}
            </span>
            <BranchTag name={pr.base.ref} />
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
    case "updated":
      return (
        <td key={col}>
          <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
            {formatRelativeTime(pr.updated_at)}
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

  const config = VARIANT_CONFIG[variant];
  const { columns } = config;

  if (loading && prs.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (prs.length === 0) {
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

  // For grouped variants, group by ticket; otherwise flat list
  const groups = config.grouped ? groupByTicket(prs) : [{ ticket: null, prs }];

  return (
    <>
      <Table hover>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{HEADER_LABELS[col] || col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, groupIdx) => {
            const isGroup = config.grouped && group.ticket !== null && group.prs.length > 1;
            const isCollapsed = isGroup && collapsed.has(group.ticket!);
            const groupKey = group.ticket ?? `ungrouped-${groupIdx}`;
            return (
              <React.Fragment key={groupKey}>
                {isGroup && (
                  <tr className="ticket-group-header" onClick={() => toggleGroup(group.ticket!)}>
                    <td colSpan={columns.length}>
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
                  group.prs.map((pr) => (
                    <tr key={pr.id} onClick={() => setSelectedPR(pr)} style={{ cursor: "pointer" }}>
                      {columns.map((col) =>
                        renderCell(col, pr, { isGrouped: !!isGroup, jiraBaseUrl }),
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
        subtitle={selectedPR?.repo_full_name}
        description={selectedPR?.body || ""}
        url={selectedPR?.html_url}
        checks={selectedPR?.checks}
      />
    </>
  );
};
