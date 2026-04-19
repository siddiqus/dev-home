import React from "react";
import { IconGitPullRequest, IconEye } from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../types";
import { formatRelativeTime } from "../utils/time";
import { GroupedPRTable } from "./GroupedPRTable";
import { ChecksStatusIcon } from "./ChecksStatusIcon";

interface PRTableProps {
  prs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
  variant: "my-prs" | "review-requests";
}

const MyPRRow: React.FC<{ pr: GitHubPR; onClick: () => void; isGrouped: boolean }> = ({
  pr,
  onClick,
  isGrouped,
}) => (
  <tr key={pr.id} onClick={onClick} style={{ cursor: "pointer" }}>
    <td style={isGrouped ? { paddingLeft: 30 } : undefined}>
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

const ReviewRequestRow: React.FC<{ pr: GitHubPR; onClick: () => void; isGrouped: boolean }> = ({
  pr,
  onClick,
  isGrouped,
}) => (
  <tr key={pr.id} onClick={onClick} style={{ cursor: "pointer" }}>
    <td style={isGrouped ? { paddingLeft: 30 } : undefined}>
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
      <ChecksStatusIcon status={pr.checks_status} />
    </td>
    <td>
      <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
        {formatRelativeTime(pr.updated_at)}
      </span>
    </td>
  </tr>
);

export const PRTable: React.FC<PRTableProps> = ({ prs, loading, jiraIssues = [], variant }) => {
  const isMyPRs = variant === "my-prs";

  return (
    <GroupedPRTable
      prs={prs}
      loading={loading}
      jiraIssues={jiraIssues}
      columnCount={isMyPRs ? 6 : 5}
      headers={
        isMyPRs ? (
          <>
            <th>PR</th>
            <th>Title</th>
            <th>Repository</th>
            <th>Branch</th>
            <th>Status</th>
            <th>Updated</th>
          </>
        ) : (
          <>
            <th>Title</th>
            <th>Repository</th>
            <th>Author</th>
            <th>Checks</th>
            <th>Updated</th>
          </>
        )
      }
      renderRow={(pr, onClick, isGrouped) =>
        isMyPRs ? (
          <MyPRRow pr={pr} onClick={onClick} isGrouped={isGrouped} />
        ) : (
          <ReviewRequestRow pr={pr} onClick={onClick} isGrouped={isGrouped} />
        )
      }
      emptyIcon={
        isMyPRs ? <IconGitPullRequest size={40} stroke={1.5} /> : <IconEye size={40} stroke={1.5} />
      }
      emptyTitle={isMyPRs ? "No open pull requests" : "No review requests"}
      emptyDescription={
        isMyPRs
          ? "You don't have any open pull requests at the moment."
          : "No one has requested your review on any pull requests."
      }
    />
  );
};
