import React from "react";
import Spinner from "react-bootstrap/Spinner";
import { IconAt } from "@tabler/icons-react";
import { GitHubComment } from "../types";
import { formatRelativeTime } from "../utils/time";
import { EmptyState } from "./EmptyState";
import { truncateText } from "../utils/text";
import { REASON_LABELS } from "../utils/github";
import { Badge } from "./primitives/Badge";
import { Avatar } from "./primitives/Avatar";
import { CommentCard } from "./primitives/CommentCard";

interface GitHubMentionsProps {
  mentions: GitHubComment[];
  loading: boolean;
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
        <CommentCard key={mention.id}>
          <div className="d-flex gap-3 align-items-start">
            <Avatar src={mention.user.avatar_url} alt={mention.user.login} size="md" />
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
                  {mention.reason && (
                    <Badge variant="purple">
                      {REASON_LABELS[mention.reason] || mention.reason}
                    </Badge>
                  )}
                  <Badge variant="neutral">{mention.repo_full_name}</Badge>
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
                className="text-secondary-custom"
                style={{
                  fontSize: "0.8125rem",
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
        </CommentCard>
      ))}
    </div>
  );
};
