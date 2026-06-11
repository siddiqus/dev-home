import React, { useState, useEffect, useRef } from "react";
import Modal from "react-bootstrap/Modal";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { IconEye, IconExternalLink, IconPlayerPlay } from "@tabler/icons-react";
import { CheckRunInfo, PRCommentsResponse, ConversationComment, ReviewComment } from "../types";
import type { ClaudeSession } from "../types/claude";
import { CLAUDE_ACTION_LABELS } from "../types/claude";
import { STATUS_CONFIG } from "./ChecksStatusIcon";
import { fetchJobLogs, fetchPRComments } from "../services/github";
import { formatRelativeTime } from "../utils/time";
import "./DescriptionModal.css";

const CHECK_SORT_ORDER: Record<string, number> = {
  FAILURE: 0,
  ERROR: 0,
  TIMED_OUT: 0,
  STARTUP_FAILURE: 0,
  ACTION_REQUIRED: 1,
  PENDING: 1,
  IN_PROGRESS: 1,
  QUEUED: 1,
  EXPECTED: 1,
  SUCCESS: 2,
  NEUTRAL: 3,
  SKIPPED: 3,
  CANCELLED: 3,
  STALE: 3,
};

function parseJobInfoFromUrl(
  url: string | null,
): { owner: string; repo: string; jobId: string } | null {
  if (!url) return null;
  // Pattern: /actions/runs/{run_id}/job/{job_id}
  const jobMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/\d+\/job\/(\d+)/);
  if (jobMatch) return { owner: jobMatch[1], repo: jobMatch[2], jobId: jobMatch[3] };
  return null;
}

function CheckRunRow({
  check,
  isSelected,
  onView,
}: {
  check: CheckRunInfo;
  isSelected: boolean;
  onView: () => void;
}) {
  const config = STATUS_CONFIG[check.status];
  const Icon = config?.icon;
  const color = config?.color || "#8b949e";
  const label = config?.title || check.status;

  return (
    <div
      className={`check-run-row ${isSelected ? "check-run-row--selected" : ""}`}
      onClick={onView}
      style={{ cursor: "pointer" }}
    >
      {Icon && <Icon size={14} stroke={1.8} color={color} />}
      <span
        style={{ flex: 1, fontSize: "0.8125rem", minWidth: 0 }}
        className="text-truncate-custom"
      >
        {check.name}
      </span>
      <span className="text-secondary-custom" style={{ fontSize: "0.75rem", flexShrink: 0 }}>
        {label}
      </span>
      <div className="check-run-actions">
        <button
          className="check-run-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          title="View logs"
        >
          <IconEye size={14} stroke={1.5} />
        </button>
        {check.url && (
          <a
            href={check.url}
            target="_blank"
            rel="noopener noreferrer"
            className="check-run-action-btn"
            onClick={(e) => e.stopPropagation()}
            title="Open in GitHub"
          >
            <IconExternalLink size={14} stroke={1.5} />
          </a>
        )}
      </div>
    </div>
  );
}

function LogViewer({ check }: { check: CheckRunInfo }) {
  const [logs, setLogs] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parsed = parseJobInfoFromUrl(check.url);
    if (!parsed) {
      setError("Logs are not available for this check — it may not be a GitHub Actions job");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setLogs(null);

    fetchJobLogs(parsed.owner, parsed.repo, parsed.jobId)
      .then((data) => {
        setLogs(data);
      })
      .catch((err) => {
        setError(err.response?.data?.error || err.message || "Failed to fetch logs");
      })
      .finally(() => setLoading(false));
  }, [check.url]);

  if (loading) {
    return (
      <div className="log-viewer-loading">
        <Spinner animation="border" size="sm" variant="secondary" />
        <span className="text-secondary-custom" style={{ fontSize: "0.8125rem" }}>
          Loading logs...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="log-viewer-error">
        <span style={{ fontSize: "0.8125rem" }}>Failed to load logs: {error}</span>
      </div>
    );
  }

  const preRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    preRef.current?.focus();
  }, [logs]);

  return (
    <div className="log-viewer">
      <pre ref={preRef} className="log-viewer-content" tabIndex={0}>
        {logs}
      </pre>
    </div>
  );
}

function CommentsView({
  repoFullName,
  prNumber,
  onCommentsLoaded,
}: {
  repoFullName: string;
  prNumber: number;
  onCommentsLoaded?: (comments: PRCommentsResponse) => void;
}) {
  const [comments, setComments] = useState<PRCommentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"conversation" | "review">("conversation");

  useEffect(() => {
    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) {
      setError("Invalid repository name");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchPRComments(owner, repo, prNumber)
      .then((data) => {
        setComments(data);
        onCommentsLoaded?.(data);
      })
      .catch((err) => {
        setError(err.response?.data?.error || err.message || "Failed to fetch comments");
      })
      .finally(() => setLoading(false));
  }, [repoFullName, prNumber, onCommentsLoaded]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Spinner animation="border" size="sm" variant="secondary" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          padding: "40px 0",
        }}
      >
        <span style={{ fontSize: "0.8125rem", color: "var(--color-status-danger, #f85149)" }}>
          Failed to load comments.
        </span>
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={() => {
            setLoading(true);
            setError(null);
            const [owner, repo] = repoFullName.split("/");
            fetchPRComments(owner, repo, prNumber)
              .then((data) => setComments(data))
              .catch((err) => setError(err.message || "Failed to fetch comments"))
              .finally(() => setLoading(false));
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const conversationCount = comments?.conversation.length || 0;
  const reviewCount = comments?.review.length || 0;

  return (
    <div>
      <div className="comments-pill-toggle">
        <button
          className={activeView === "conversation" ? "active" : ""}
          onClick={() => setActiveView("conversation")}
        >
          Conversation ({conversationCount})
        </button>
        <button
          className={activeView === "review" ? "active" : ""}
          onClick={() => setActiveView("review")}
        >
          Review ({reviewCount})
        </button>
      </div>

      {activeView === "conversation" && (
        <div>
          {conversationCount === 0 ? (
            <p
              style={{
                fontStyle: "italic",
                color: "var(--color-text-secondary)",
                fontSize: "0.8125rem",
              }}
            >
              No comments on this PR yet.
            </p>
          ) : (
            comments!.conversation.map((comment) => (
              <div key={comment.id} className="comment-card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <img
                    src={comment.user.avatar_url}
                    alt={comment.user.login}
                    style={{ width: 20, height: 20, borderRadius: "50%" }}
                  />
                  <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                    {comment.user.login}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                    {formatRelativeTime(comment.created_at)}
                  </span>
                  <a
                    href={comment.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      marginLeft: "auto",
                      fontSize: "0.75rem",
                      color: "var(--color-accent)",
                      textDecoration: "none",
                    }}
                  >
                    ↗ GitHub
                  </a>
                </div>
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkBreaks]}>{comment.body}</ReactMarkdown>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeView === "review" && (
        <div>
          {reviewCount === 0 ? (
            <p
              style={{
                fontStyle: "italic",
                color: "var(--color-text-secondary)",
                fontSize: "0.8125rem",
              }}
            >
              No review comments on this PR.
            </p>
          ) : (
            comments!.review.map((comment) => (
              <div
                key={comment.id}
                className="comment-card"
                style={{ opacity: comment.is_resolved ? 0.45 : 1 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="file-badge">
                      {comment.path}
                      {comment.line !== null ? `:${comment.line}` : ""}
                    </span>
                    {comment.is_resolved && <span className="resolved-badge">Resolved</span>}
                  </div>
                  <a
                    href={comment.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-accent)",
                      textDecoration: "none",
                    }}
                  >
                    ↗ GitHub
                  </a>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <img
                    src={comment.user.avatar_url}
                    alt={comment.user.login}
                    style={{ width: 20, height: 20, borderRadius: "50%" }}
                  />
                  <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                    {comment.user.login}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                    {formatRelativeTime(comment.created_at)}
                  </span>
                </div>
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkBreaks]}>{comment.body}</ReactMarkdown>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface DescriptionModalProps {
  show: boolean;
  onHide: () => void;
  title: string;
  subtitle?: string;
  description: string;
  url?: string;
  checks?: CheckRunInfo[];
  activeSessions?: ClaudeSession[];
  onViewSession?: (sessionId: string) => void;
  repoFullName?: string;
  prNumber?: number;
}

export const DescriptionModal: React.FC<DescriptionModalProps> = ({
  show,
  onHide,
  title,
  subtitle,
  description,
  url,
  checks,
  activeSessions,
  onViewSession,
  repoFullName,
  prNumber,
}) => {
  const sortedChecks =
    checks && checks.length > 0
      ? [...checks].sort(
          (a, b) => (CHECK_SORT_ORDER[a.status] ?? 9) - (CHECK_SORT_ORDER[b.status] ?? 9),
        )
      : null;

  const hasChecks = !!sortedChecks;
  const hasActiveSessions = !!activeSessions && activeSessions.length > 0;
  const [selectedCheck, setSelectedCheck] = useState<CheckRunInfo | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "comments">("overview");
  const [commentsCache, setCommentsCache] = useState<PRCommentsResponse | null>(null);

  useEffect(() => {
    if (show) {
      setSelectedCheck(null);
      setActiveTab("overview");
      setCommentsCache(null);
    }
  }, [show]);

  const canShowComments = repoFullName && prNumber !== undefined;
  const totalComments = commentsCache
    ? commentsCache.conversation.length + commentsCache.review.length
    : 0;

  return (
    <Modal
      show={show}
      onHide={onHide}
      fullscreen
      className="description-modal description-modal--fullscreen"
    >
      <Modal.Header closeButton />

      <Modal.Body className="modal-tab-content">
        <div className="modal-title-section">
          <div style={{ fontSize: "1rem", fontWeight: 600 }}>{title}</div>
          {subtitle && (
            <div
              className="text-secondary-custom"
              style={{ fontSize: "0.75rem", fontWeight: 400, marginTop: 2 }}
            >
              {subtitle}
            </div>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "0.75rem", marginTop: 4, display: "inline-block" }}
              className="text-truncate-custom"
              title={url}
            >
              {url}
            </a>
          )}
        </div>

        {canShowComments && (
          <div className="modal-tabs">
            <div
              className={`modal-tab ${activeTab === "overview" ? "modal-tab--active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              Overview
            </div>
            <div
              className={`modal-tab ${activeTab === "comments" ? "modal-tab--active" : ""}`}
              onClick={() => setActiveTab("comments")}
            >
              Comments
              {commentsCache && totalComments > 0 && (
                <span style={{ marginLeft: 4 }}>({totalComments})</span>
              )}
            </div>
          </div>
        )}

        {activeTab === "overview" && (
          <Row className="g-0 modal-split-layout">
            <Col md={hasActiveSessions ? 8 : 12} className="modal-description-col">
              <div className="modal-body-section-header">Description</div>
              {description ? (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkBreaks]}>{description}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-secondary-custom" style={{ fontStyle: "italic" }}>
                  No description provided.
                </p>
              )}

              {hasChecks && (
                <div
                  className="modal-checks-col"
                  style={{
                    marginTop: 16,
                    borderTop: "1px solid var(--border-color)",
                    paddingTop: 16,
                  }}
                >
                  {selectedCheck ? (
                    <div className="checks-log-view">
                      <div className="checks-log-view-header">
                        <span className="modal-body-section-header">
                          Check: {selectedCheck.name}
                          {selectedCheck.url && (
                            <>
                              &nbsp;&nbsp; | &nbsp;&nbsp;
                              <a
                                href={selectedCheck.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="checks-back-btn"
                              >
                                Open in GitHub <IconExternalLink size={12} stroke={1.5} />
                              </a>
                            </>
                          )}
                        </span>

                        <button className="checks-back-btn" onClick={() => setSelectedCheck(null)}>
                          Back to checks
                        </button>
                      </div>
                      <LogViewer
                        key={selectedCheck.url || selectedCheck.name}
                        check={selectedCheck}
                      />
                    </div>
                  ) : (
                    <div className="checks-list-view">
                      <div className="modal-body-section-header">Checks</div>
                      {sortedChecks!.map((check, i) => (
                        <CheckRunRow
                          key={`${check.name}-${i}`}
                          check={check}
                          isSelected={false}
                          onView={() => setSelectedCheck(check)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Col>
            {hasActiveSessions && (
              <Col md={4} className="modal-checks-col">
                <div className="modal-body-section-header">Active Claude Sessions</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activeSessions!.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        onViewSession?.(s.id);
                        onHide();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "var(--card-bg)",
                        cursor: "pointer",
                        fontSize: "0.8125rem",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <IconPlayerPlay size={14} color="var(--bs-success)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{CLAUDE_ACTION_LABELS[s.action]}</div>
                        <div className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                          Running
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Col>
            )}
          </Row>
        )}

        {activeTab === "comments" && canShowComments && (
          <div style={{ flex: 1, overflow: "auto" }}>
            <CommentsView
              repoFullName={repoFullName!}
              prNumber={prNumber!}
              onCommentsLoaded={setCommentsCache}
            />
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
