import React from "react";
import { IconGitPullRequest } from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../types";
import { formatRelativeTime } from "../utils/time";
import { GroupedPRTable } from "./GroupedPRTable";
import { ChecksStatusIcon } from "./ChecksStatusIcon";

interface OpenPRsProps {
  prs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
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
    <td>
      <div className="d-flex align-items-center gap-1">
        <span className="branch-tag">{pr.head.ref}</span>
        <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
          {"\u2192"}
        </span>
        <span className="branch-tag">{pr.base.ref}</span>
      </div>
    </td>
    <td>
      <div className="d-flex align-items-center gap-2">
        {pr.draft ? (
          <span className="badge badge-status-neutral">Draft</span>
        ) : (
          <span className="badge badge-status-green">Open</span>
        )}
        <ChecksStatusIcon status={pr.checks_status} />
      </div>
    </td>
    <td>
      <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
        {formatRelativeTime(pr.updated_at)}
      </span>
    </td>
  </tr>
);

export const OpenPRs: React.FC<OpenPRsProps> = ({ prs, loading, jiraIssues = [] }) => {
  return (
    <GroupedPRTable
      prs={prs}
      loading={loading}
      jiraIssues={jiraIssues}
      columnCount={6}
      headers={
        <>
          <th>PR</th>
          <th>Title</th>
          <th>Repository</th>
          <th>Branch</th>
          <th>Status</th>
          <th>Updated</th>
        </>
      }
      renderRow={(pr, onClick) => <PRRow pr={pr} onClick={onClick} />}
      emptyIcon={<IconGitPullRequest size={40} stroke={1.5} />}
      emptyTitle="No open pull requests"
      emptyDescription="You don't have any open pull requests at the moment."
    />
  );
};
