import React, { useState } from "react";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import { IconChecklist } from "@tabler/icons-react";
import { JiraIssue } from "../types";
import { formatRelativeTime } from "../hooks/useRelativeTime";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import { DescriptionModal } from "./DescriptionModal";
import { Badge } from "./primitives/Badge";

interface JiraTasksProps {
  issues: JiraIssue[];
  loading: boolean;
  baseUrl?: string;
}

export const JiraTasks: React.FC<JiraTasksProps> = ({ issues: rawIssues, loading, baseUrl }) => {
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const issues = [...rawIssues].sort(
    (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
  );

  if (loading && rawIssues.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (rawIssues.length === 0) {
    return (
      <EmptyState
        icon={<IconChecklist size={40} stroke={1.5} />}
        title="No assigned issues"
        description="You have no JIRA issues currently assigned to you. Enjoy the calm."
      />
    );
  }

  return (
    <>
      <Table hover>
        <thead>
          <tr>
            <th style={{ width: 32 }} />
            <th>Key</th>
            <th>Summary</th>
            <th>Status</th>
            <th>Project</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => {
            const browseUrl = baseUrl
              ? `${baseUrl.replace(/\/$/, "")}/browse/${issue.key}`
              : `#${issue.key}`;

            return (
              <tr
                key={issue.key}
                onClick={() => setSelectedIssue(issue)}
                style={{ cursor: "pointer" }}
              >
                <td>
                  {issue.priority?.iconUrl && (
                    <img
                      src={issue.priority.iconUrl}
                      alt={issue.priority.name}
                      className="priority-icon"
                    />
                  )}
                </td>
                <td>
                  <a
                    href={browseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontWeight: 500, whiteSpace: "nowrap" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {issue.key}
                  </a>
                </td>
                <td>
                  <span className="text-truncate-custom d-block" style={{ maxWidth: 420 }}>
                    {issue.summary}
                  </span>
                </td>
                <td>
                  <StatusBadge
                    statusName={issue.status.name}
                    colorName={issue.status.statusCategory.colorName}
                  />
                </td>
                <td>
                  <Badge variant="neutral">{issue.project.key}</Badge>
                </td>
                <td>
                  <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
                    {formatRelativeTime(issue.updated)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <DescriptionModal
        show={!!selectedIssue}
        onHide={() => setSelectedIssue(null)}
        title={selectedIssue ? `${selectedIssue.key}: ${selectedIssue.summary}` : ""}
        subtitle={selectedIssue?.project.name}
        description={selectedIssue?.description || ""}
        url={
          selectedIssue && baseUrl
            ? `${baseUrl.replace(/\/$/, "")}/browse/${selectedIssue.key}`
            : undefined
        }
      />
    </>
  );
};
