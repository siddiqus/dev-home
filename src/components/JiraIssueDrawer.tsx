import React, { useEffect } from "react";
import Offcanvas from "react-bootstrap/Offcanvas";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { IconExternalLink, IconGitPullRequest } from "@tabler/icons-react";
import { JiraIssue } from "../types";
import type { LinkedPR } from "../types/teams";
import { Avatar } from "./primitives/Avatar";
import { staleTone } from "../views/teams/cockpit/staleTone";
import "./JiraIssueDrawer.css";

interface JiraIssueDrawerProps {
  issue: JiraIssue | null;
  show: boolean;
  onHide: () => void;
  baseUrl?: string;
  /** PRs linked to this issue, shown at the bottom of the drawer. */
  linkedPRs?: LinkedPR[];
  staleDays?: number;
}

export const JiraIssueDrawer: React.FC<JiraIssueDrawerProps> = ({
  issue,
  show,
  onHide,
  baseUrl,
  linkedPRs,
  staleDays,
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
          {issue?.issueType?.name && (
            <div className="jira-drawer-type">
              {issue.issueType.iconUrl && (
                <img
                  src={issue.issueType.iconUrl}
                  alt={issue.issueType.name}
                  width={14}
                  height={14}
                />
              )}
              <span>{issue.issueType.name}</span>
            </div>
          )}
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

        {staleDays != null && staleDays > 0 && (
          <div className="jira-drawer-assignee">
            <div className="modal-body-section-header">Staleness</div>
            <span style={{ fontSize: "0.8125rem", color: staleTone(staleDays) }}>
              No update in {staleDays} days
            </span>
          </div>
        )}

        {linkedPRs && linkedPRs.length > 0 && (
          <div className="jira-drawer-linked-prs">
            <div className="modal-body-section-header">Linked PRs</div>
            <div className="d-flex flex-column gap-2">
              {linkedPRs.map((pr) => (
                <a
                  key={`${pr.repo_full_name}#${pr.number}`}
                  href={pr.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="d-flex align-items-start gap-2 text-decoration-none"
                  style={{ fontSize: "0.8125rem" }}
                >
                  <IconGitPullRequest
                    size={15}
                    stroke={1.5}
                    style={{ flexShrink: 0, marginTop: 2 }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span className="text-secondary-custom">{pr.repo_full_name}</span>{" "}
                    <span className="text-secondary-custom">#{pr.number}</span>
                    <div>{pr.title}</div>
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </Offcanvas.Body>
    </Offcanvas>
  );
};
