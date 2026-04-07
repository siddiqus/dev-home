import React, { useState } from "react";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import { IconEye, IconChevronRight, IconChevronDown } from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../types";
import { formatRelativeTime } from "../hooks/useRelativeTime";
import { EmptyState } from "./EmptyState";
import { DescriptionModal } from "./DescriptionModal";

interface ReviewRequestsProps {
  reviews: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
}

function extractTicket(title: string): string | null {
  const match = title.match(/\[([a-zA-Z]+-\d+)\]/i);
  return match ? match[1].toUpperCase() : null;
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

const ReviewRow: React.FC<{ pr: GitHubPR; onClick: () => void }> = ({ pr, onClick }) => (
  <tr key={pr.id} onClick={onClick} style={{ cursor: "pointer" }}>
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
    <td>
      <div className="d-flex align-items-center gap-2">
        <img src={pr.user.avatar_url} alt={pr.user.login} className="avatar-sm" />
        <span style={{ fontSize: "0.8125rem" }}>{pr.user.login}</span>
      </div>
    </td>
    <td>
      <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
        {formatRelativeTime(pr.updated_at)}
      </span>
    </td>
  </tr>
);

export const ReviewRequests: React.FC<ReviewRequestsProps> = ({ reviews, loading, jiraIssues = [] }) => {
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (loading && reviews.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<IconEye size={40} stroke={1.5} />}
        title="No review requests"
        description="No one has requested your review on any pull requests."
      />
    );
  }

  const groups = groupByTicket(reviews);
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
            <th>Title</th>
            <th>Repository</th>
            <th>Author</th>
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
                    <td colSpan={4}>
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
                    <ReviewRow key={pr.id} pr={pr} onClick={() => setSelectedPR(pr)} />
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
