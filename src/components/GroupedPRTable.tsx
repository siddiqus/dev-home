import React, { useState } from "react";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import { IconChevronRight, IconChevronDown } from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../types";
import { EmptyState } from "./EmptyState";
import { DescriptionModal } from "./DescriptionModal";
import { groupByTicket } from "../utils/tickets";

interface GroupedPRTableProps {
  prs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
  headers: React.ReactNode;
  columnCount: number;
  renderRow: (pr: GitHubPR, onClick: () => void) => React.ReactNode;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string;
}

export const GroupedPRTable: React.FC<GroupedPRTableProps> = ({
  prs,
  loading,
  jiraIssues = [],
  headers,
  columnCount,
  renderRow,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}) => {
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
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
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
          <tr>{headers}</tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const isGroup = group.ticket !== null && group.prs.length > 1;
            const isCollapsed = isGroup && collapsed.has(group.ticket!);
            return (
              <React.Fragment key={group.ticket ?? "ungrouped"}>
                {isGroup && (
                  <tr className="ticket-group-header" onClick={() => toggleGroup(group.ticket!)}>
                    <td colSpan={columnCount}>
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
                    <React.Fragment key={pr.id}>
                      {renderRow(pr, () => setSelectedPR(pr))}
                    </React.Fragment>
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
