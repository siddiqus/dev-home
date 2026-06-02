import React, { useState } from "react";
import Table from "react-bootstrap/Table";
import { JiraIssue } from "../types";
import { formatRelativeTime } from "../hooks/useRelativeTime";
import { StatusBadge } from "./StatusBadge";
import { DescriptionModal } from "./DescriptionModal";
import { Badge } from "./primitives/Badge";
import { Avatar } from "./primitives/Avatar";

interface JiraIssueTableProps {
  issues: JiraIssue[];
  baseUrl?: string;
}

export const JiraIssueTable: React.FC<JiraIssueTableProps> = ({ issues, baseUrl }) => {
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);

  return (
    <>
      <Table hover>
        <thead>
          <tr>
            <th style={{ width: 32 }} />
            <th>Key</th>
            <th>Summary</th>
            <th>Status</th>
            <th>Assignee</th>
            <th>Project</th>
            <th>Created</th>
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
                  {issue.assignee ? (
                    <div className="d-flex align-items-center gap-2">
                      <Avatar
                        src={issue.assignee.avatarUrls ? issue.assignee.avatarUrls["48x48"] : ""}
                        alt={issue.assignee.displayName}
                        size="sm"
                      />
                      <span style={{ fontSize: "0.8125rem" }}>{issue.assignee.displayName}</span>
                    </div>
                  ) : (
                    <span className="text-secondary-custom">Unassigned</span>
                  )}
                </td>
                <td>
                  <Badge variant="neutral">{issue.project.key}</Badge>
                </td>
                <td>
                  <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
                    {issue.created ? formatRelativeTime(issue.created) : "—"}
                  </span>
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
