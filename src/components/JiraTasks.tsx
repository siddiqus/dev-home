import React from "react";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import { IconChecklist } from "@tabler/icons-react";
import { JiraIssue } from "../types";
import { formatRelativeTime } from "../hooks/useRelativeTime";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";

interface JiraTasksProps {
  issues: JiraIssue[];
  loading: boolean;
  baseUrl?: string;
}

export const JiraTasks: React.FC<JiraTasksProps> = ({
  issues,
  loading,
  baseUrl,
}) => {
  if (loading && issues.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <EmptyState
        icon={<IconChecklist size={40} stroke={1.5} />}
        title="No assigned issues"
        description="You have no JIRA issues currently assigned to you. Enjoy the calm."
      />
    );
  }

  return (
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
            <tr key={issue.key}>
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
                >
                  {issue.key}
                </a>
              </td>
              <td>
                <span
                  className="text-truncate-custom d-block"
                  style={{ maxWidth: 420 }}
                >
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
                <span className="badge badge-status-neutral">
                  {issue.project.key}
                </span>
              </td>
              <td>
                <span
                  className="text-secondary-custom"
                  style={{ whiteSpace: "nowrap" }}
                >
                  {formatRelativeTime(issue.updated)}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
};
