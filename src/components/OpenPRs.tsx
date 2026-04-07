import React, { useState } from "react";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import { IconGitPullRequest, IconChevronRight, IconChevronDown } from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../types";
import { formatRelativeTime } from "../hooks/useRelativeTime";
import { EmptyState } from "./EmptyState";
import { DescriptionModal } from "./DescriptionModal";

interface OpenPRsProps {
  prs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
}

function extractTicket(title: string): string | null {
  const match = title.match(/^[A-Z]+-\d+/i);
  return match ? match[0] : null;
}

function groupByTicket(prs: GitHubPR[]): { ticket: string | null; prs: GitHubPR[] }[] {
  // Sort all PRs by updated_at ascending first
  const sorted = [...prs].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  // Group adjacent PRs that share the same ticket
  const groups: { ticket: string | null; prs: GitHubPR[] }[] = [];
  for (const pr of sorted) {
    const ticket = extractTicket(pr.title);
    const last = groups[groups.length - 1];
    if (last && last.ticket === ticket) {
      last.prs.push(pr);
    } else {
      groups.push({ ticket, prs: [pr] });
    }
  }

  return groups;
}

const PRRow: React.FC<{ pr: GitHubPR; onClick: () => void }> = ({ pr, onClick }) => (
  <tr key={pr.id} onClick={onClick} style={{ cursor: "pointer" }}>
    <td>
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
    <td>
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
    <td>
      <span className="badge badge-status-neutral">{pr.repo_full_name}</span>
    </td>
    {/* <td>
      <div className="d-flex align-items-center gap-1">
        <span className="branch-tag">{pr.head.ref}</span>
        <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
          {"\u2192"}
        </span>
        <span className="branch-tag">{pr.base.ref}</span>
      </div>
    </td> */}
    <td>
      {pr.draft ? (
        <span className="badge badge-status-neutral">Draft</span>
      ) : (
        <span className="badge badge-status-green">Open</span>
      )}
    </td>
    <td>
      <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
        {formatRelativeTime(pr.updated_at)}
      </span>
    </td>
  </tr>
);

export const OpenPRs: React.FC<OpenPRsProps> = ({ prs, loading, jiraIssues = [] }) => {
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
        icon={<IconGitPullRequest size={40} stroke={1.5} />}
        title="No open pull requests"
        description="You don't have any open pull requests at the moment."
      />
    );
  }

  const groups = groupByTicket(prs);
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

  return (
    <>
      <Table hover>
        <thead>
          <tr>
            <th>PR</th>
            <th>Title</th>
            <th>Repository</th>
            {/* <th>Branch</th> */}
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const isGroup = group.ticket !== null && group.prs.length > 1;
            const isCollapsed = isGroup && collapsed.has(group.ticket!);
            return (
              <React.Fragment key={group.ticket ?? "ungrouped"}>
                {isGroup && (
                  <tr
                    className="ticket-group-header"
                    onClick={() => toggleGroup(group.ticket!)}
                  >
                    <td colSpan={6}>
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
                    </td>
                  </tr>
                )}
                {!isCollapsed &&
                  group.prs.map((pr) => (
                    <PRRow key={pr.id} pr={pr} onClick={() => setSelectedPR(pr)} />
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
      />
    </>
  );
};
