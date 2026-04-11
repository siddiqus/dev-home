import React from "react";
import { IconEye } from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../types";
import { formatRelativeTime } from "../utils/time";
import { GroupedPRTable } from "./GroupedPRTable";
import { ChecksStatusIcon } from "./ChecksStatusIcon";

interface ReviewRequestsProps {
  reviews: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
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
      <ChecksStatusIcon status={pr.checks_status} />
    </td>
    <td>
      <span className="text-secondary-custom" style={{ whiteSpace: "nowrap" }}>
        {formatRelativeTime(pr.updated_at)}
      </span>
    </td>
  </tr>
);

export const ReviewRequests: React.FC<ReviewRequestsProps> = ({
  reviews,
  loading,
  jiraIssues = [],
}) => {
  return (
    <GroupedPRTable
      prs={reviews}
      loading={loading}
      jiraIssues={jiraIssues}
      columnCount={5}
      headers={
        <>
          <th>Title</th>
          <th>Repository</th>
          <th>Author</th>
          <th>Checks</th>
          <th>Updated</th>
        </>
      }
      renderRow={(pr, onClick) => <ReviewRow pr={pr} onClick={onClick} />}
      emptyIcon={<IconEye size={40} stroke={1.5} />}
      emptyTitle="No review requests"
      emptyDescription="No one has requested your review on any pull requests."
    />
  );
};
