import React from "react";
import Spinner from "react-bootstrap/Spinner";
import { IconMessageCircle } from "@tabler/icons-react";
import { JiraComment } from "../types";
import { formatRelativeTime } from "../utils/time";
import { EmptyState } from "./EmptyState";
import { truncateText } from "../utils/text";
import { Avatar } from "./primitives/Avatar";
import { CommentCard } from "./primitives/CommentCard";

interface JiraCommentsProps {
  comments: JiraComment[];
  loading: boolean;
  baseUrl?: string;
}

export const JiraComments: React.FC<JiraCommentsProps> = ({ comments, loading, baseUrl }) => {
  if (loading && comments.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <EmptyState
        icon={<IconMessageCircle size={40} stroke={1.5} />}
        title="No recent mentions"
        description="No one has mentioned you in JIRA comments recently."
      />
    );
  }

  return (
    <div className="d-flex flex-column gap-2">
      {comments.map((comment) => {
        const issueUrl = baseUrl
          ? `${baseUrl.replace(/\/$/, "")}/browse/${comment.issueKey}`
          : `#${comment.issueKey}`;

        return (
          <CommentCard key={comment.id}>
            <div className="d-flex gap-3 align-items-start">
              <Avatar
                src={comment.author.avatarUrls["48x48"]}
                alt={comment.author.displayName}
                size="md"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="d-flex justify-content-between align-items-center gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                      {comment.author.displayName}
                    </span>
                    <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                      {formatRelativeTime(comment.created)}
                    </span>
                  </div>
                  <a
                    href={issueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {comment.issueKey}
                  </a>
                </div>
                <div
                  className="text-secondary-custom"
                  style={{ fontSize: "0.75rem", marginTop: 2 }}
                >
                  on: {comment.issueSummary}
                </div>
                <div
                  className="text-secondary-custom"
                  style={{
                    fontSize: "0.8125rem",
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {truncateText(comment.body?.text || "", 120)}
                </div>
              </div>
            </div>
          </CommentCard>
        );
      })}
    </div>
  );
};
