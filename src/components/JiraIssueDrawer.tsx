import React, { useEffect } from "react";
import Offcanvas from "react-bootstrap/Offcanvas";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { IconExternalLink } from "@tabler/icons-react";
import { JiraIssue } from "../types";
import { Avatar } from "./primitives/Avatar";
import "./JiraIssueDrawer.css";

interface JiraIssueDrawerProps {
  issue: JiraIssue | null;
  show: boolean;
  onHide: () => void;
  baseUrl?: string;
}

export const JiraIssueDrawer: React.FC<JiraIssueDrawerProps> = ({
  issue,
  show,
  onHide,
  baseUrl,
}) => {
  const url = issue && baseUrl ? `${baseUrl.replace(/\/$/, "")}/browse/${issue.key}` : undefined;

  // With backdrop={false} the list stays interactive, so there is no overlay to
  // catch outside clicks. Close the drawer when a click lands outside the panel.
  useEffect(() => {
    if (!show) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && !target.closest(".jira-issue-drawer")) {
        onHide();
      }
    };
    // Defer attaching so the click that opened the drawer doesn't immediately close it.
    const id = window.setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [show, onHide]);

  return (
    <Offcanvas
      show={show}
      onHide={onHide}
      placement="end"
      backdrop={false}
      scroll
      className="jira-issue-drawer"
    >
      <Offcanvas.Header closeButton>
        <div className="jira-drawer-header">
          <div className="jira-drawer-title">{issue ? `${issue.key}: ${issue.summary}` : ""}</div>
          {issue?.project.name && <div className="jira-drawer-subtitle">{issue.project.name}</div>}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="jira-drawer-link">
              Open in Jira
              <IconExternalLink size={13} stroke={1.5} />
            </a>
          )}
        </div>
      </Offcanvas.Header>

      <Offcanvas.Body className="jira-drawer-body">
        <div className="jira-drawer-content">
          <div className="modal-body-section-header">Description</div>
          {issue?.description ? (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkBreaks]}>{issue.description}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-secondary-custom" style={{ fontStyle: "italic" }}>
              No description provided.
            </p>
          )}
        </div>

        <div className="jira-drawer-assignee">
          <div className="modal-body-section-header">Assignee</div>
          {issue?.assignee ? (
            <div className="d-flex align-items-center gap-2">
              <Avatar
                src={issue.assignee.avatarUrls ? issue.assignee.avatarUrls["48x48"] : ""}
                alt={issue.assignee.displayName}
                size="sm"
              />
              <span style={{ fontSize: "0.8125rem" }}>{issue.assignee.displayName}</span>
            </div>
          ) : (
            <span className="text-secondary-custom" style={{ fontSize: "0.8125rem" }}>
              Unassigned
            </span>
          )}
        </div>
      </Offcanvas.Body>
    </Offcanvas>
  );
};
