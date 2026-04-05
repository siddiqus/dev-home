import React, { useState } from "react";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import { IconGitPullRequest } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { formatRelativeTime } from "../hooks/useRelativeTime";
import { EmptyState } from "./EmptyState";
import { DescriptionModal } from "./DescriptionModal";

interface OpenPRsProps {
  prs: GitHubPR[];
  loading: boolean;
}

export const OpenPRs: React.FC<OpenPRsProps> = ({ prs, loading }) => {
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);

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

  return (
    <>
      <Table hover>
        <thead>
          <tr>
            <th>PR</th>
            <th>Title</th>
            <th>Repository</th>
            <th>Branch</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {prs.map((pr) => (
            <tr key={pr.id} onClick={() => setSelectedPR(pr)} style={{ cursor: "pointer" }}>
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
                <div className="d-flex align-items-center gap-1">
                  <span className="branch-tag">{pr.head.ref}</span>
                  <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                    {"\u2192"}
                  </span>
                  <span className="branch-tag">{pr.base.ref}</span>
                </div>
              </td>
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
