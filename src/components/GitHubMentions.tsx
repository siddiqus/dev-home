import React from "react";
import { IconAt } from "@tabler/icons-react";
import { GitHubComment } from "../types";
import { formatRelativeTime } from "../utils/time";
import { truncateText } from "../utils/text";
import { REASON_LABELS } from "../utils/github";
import { Badge } from "./primitives/Badge";
import { Avatar } from "./primitives/Avatar";
import { CommentCard } from "./primitives/CommentCard";
import { CommentList } from "./primitives/CommentList";

export interface GitHubMentionGroup {
  key: string;
  comments: GitHubComment[];
}

interface GitHubMentionsProps {
  groups: GitHubMentionGroup[];
  loading: boolean;
}

export const GitHubMentions: React.FC<GitHubMentionsProps> = ({ groups, loading }) => {
  return (
    <CommentList
      loading={loading}
      isEmpty={groups.length === 0}
      emptyState={{
        icon: <IconAt size={40} stroke={1.5} />,
        title: "No GitHub mentions",
        description: "You haven't been mentioned in any GitHub comments recently.",
      }}
    >
      {groups.map((group) => {
        // Comments are pre-sorted newest first; the first drives the header.
        const head = group.comments[0];
        return (
          <CommentCard key={group.key}>
            <div className="d-flex gap-3 align-items-start">
              <Avatar src={head.user.avatar_url} alt={head.user.login} size="md" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="d-flex justify-content-between align-items-center gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                      {head.user.login}
                    </span>
                    <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                      {formatRelativeTime(head.created_at)}
                    </span>
                    {group.comments.length > 1 && (
                      <Badge variant="purple">{group.comments.length}</Badge>
                    )}
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    {head.reason && (
                      <Badge variant="purple">{REASON_LABELS[head.reason] || head.reason}</Badge>
                    )}
                    <Badge variant="neutral">{head.repo_full_name}</Badge>
                    <span
                      className="text-secondary-custom"
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      #{head.pr_number}
                    </span>
                  </div>
                </div>
                {head.context_title && (
                  <div
                    className="text-secondary-custom"
                    style={{ fontSize: "0.75rem", marginTop: 2 }}
                  >
                    on: {head.context_title}
                  </div>
                )}
                {group.comments.map((comment, index) => (
                  <div
                    key={comment.id}
                    style={
                      index > 0
                        ? {
                            marginTop: 10,
                            paddingTop: 10,
                            borderTop: "1px solid var(--color-border-subtle)",
                          }
                        : undefined
                    }
                  >
                    {index > 0 && (
                      <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                        {formatRelativeTime(comment.created_at)}
                      </span>
                    )}
                    <div className="d-flex align-items-center gap-3" style={{ marginTop: 6 }}>
                      <div
                        className="text-secondary-custom text-truncate-custom"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: "0.8125rem",
                          lineHeight: 1.5,
                        }}
                      >
                        {truncateText(comment.body || "", 120)}
                      </div>
                      <a
                        href={comment.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "0.75rem", flexShrink: 0, whiteSpace: "nowrap" }}
                      >
                        View comment
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CommentCard>
        );
      })}
    </CommentList>
  );
};
