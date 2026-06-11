import React, { useState, useEffect, useRef } from "react";
import Modal from "react-bootstrap/Modal";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { IconEye, IconExternalLink, IconPlayerPlay } from "@tabler/icons-react";
import { CheckRunInfo } from "../types";
import type { ClaudeSession } from "../types/claude";
import { CLAUDE_ACTION_LABELS } from "../types/claude";
import { STATUS_CONFIG } from "./ChecksStatusIcon";
import { fetchJobLogs } from "../services/github";
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
  const preRef = useRef<HTMLPreElement>(null);

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

  useEffect(() => {
    preRef.current?.focus();
  }, [logs]);

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

  return (
    <div className="log-viewer">
      <pre ref={preRef} className="log-viewer-content" tabIndex={0}>
        {logs}
      </pre>
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

  useEffect(() => {
    if (show) {
      setSelectedCheck(null);
    }
  }, [show]);

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

        <Row className="g-0 modal-split-layout">
          <Col md={hasChecks ? 6 : hasActiveSessions ? 8 : 12} className="modal-description-col">
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
          </Col>
          {hasChecks && (
            <Col md={6} className="modal-checks-col">
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
                  <LogViewer key={selectedCheck.url || selectedCheck.name} check={selectedCheck} />
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
            </Col>
          )}
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
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
