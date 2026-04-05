import React, { useState } from "react";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import { IconEye } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { formatRelativeTime } from "../hooks/useRelativeTime";
import { EmptyState } from "./EmptyState";
import { DescriptionModal } from "./DescriptionModal";

interface ReviewRequestsProps {
  reviews: GitHubPR[];
  loading: boolean;
}

export const ReviewRequests: React.FC<ReviewRequestsProps> = ({ reviews, loading }) => {
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);

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

  return (
    <>
      <Table hover>
        <thead>
          <tr>
            <th style={{ width: 80 }} />
            <th>PR</th>
            <th>Title</th>
            <th>Repository</th>
            <th>Author</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((pr) => (
            <tr key={pr.id} onClick={() => setSelectedPR(pr)} style={{ cursor: "pointer" }}>
              <td>
                <span className="badge badge-status-yellow">Review</span>
              </td>
              <td>
                <span
                  className="text-secondary-custom"
                  style={{ fontWeight: 500, whiteSpace: "nowrap" }}
                >
                  #{pr.number}
                </span>
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
          ))}
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
