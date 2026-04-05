import React from "react";
import Spinner from "react-bootstrap/Spinner";
import { IconAt } from "@tabler/icons-react";
import { GitHubComment } from "../types";
import { formatRelativeTime } from "../hooks/useRelativeTime";
import { EmptyState } from "./EmptyState";

interface GitHubMentionsProps {
  mentions: GitHubComment[];
  loading: boolean;
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

export const GitHubMentions: React.FC<GitHubMentionsProps> = ({ mentions, loading }) => {
  if (loading && mentions.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (mentions.length === 0) {
    return (
      <EmptyState
        icon={<IconAt size={40} stroke={1.5} />}
        title="No GitHub mentions"
        description="You haven't been mentioned in any GitHub comments recently."
      />
    );
  }

  return (
    <div className="d-flex flex-column gap-2">
      {mentions.map((mention) => (
        <div key={mention.id} className="comment-card">
          <div className="d-flex gap-3 align-items-start">
            <img src={mention.user.avatar_url} alt={mention.user.login} className="avatar-md" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="d-flex justify-content-between align-items-center gap-2">
                <div className="d-flex align-items-center gap-2">
                  <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                    {mention.user.login}
                  </span>
                  <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                    {formatRelativeTime(mention.created_at)}
                  </span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge badge-status-neutral">{mention.repo_full_name}</span>
                  <span
                    className="text-secondary-custom"
                    style={{ fontSize: "0.75rem", fontWeight: 500 }}
                  >
                    #{mention.pr_number}
                  </span>
                </div>
              </div>
              {mention.context_title && (
                <div
                  className="text-secondary-custom"
                  style={{ fontSize: "0.75rem", marginTop: 2 }}
                >
                  on: {mention.context_title}
                </div>
              )}
              <div
                style={{
                  fontSize: "0.8125rem",
                  color: "#8b949e",
                  marginTop: 6,
                  lineHeight: 1.5,
                }}
              >
                {truncateText(mention.body || "", 120)}
              </div>
              <div style={{ marginTop: 6 }}>
                <a
                  href={mention.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "0.75rem" }}
                >
                  View comment
                </a>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
