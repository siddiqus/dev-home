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
import type { GitHubPR } from "../types";
import type { ClaudeAction, ClaudeSession } from "../types/claude";
import { CLAUDE_ACTION_LABELS } from "../types/claude";
import { STATUS_CONFIG } from "./ChecksStatusIcon";
import { ClaudeActionDropdown } from "./ClaudeActionDropdown";
import { fetchJobLogs } from "../services/github";
import { PrNotesPanel } from "./PrNotesPanel";
import { formatRelativeTime } from "../utils/time";
import { extractTicketKey, sourceFromPR } from "../utils/tickets";
import { categorizeOpenPR } from "../utils/prCategories";
import {
  BranchPill,
  DiffStat,
  PRLabels,
  PRStateIcon,
  ReasonChips,
  StatusPill,
  renderTitleContent,
} from "./prIndicators";
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

function columnWidths(hasChecks: boolean, hasSessions: boolean, hasNotes: boolean) {
  if (!hasNotes) {
    return { desc: hasChecks ? 6 : hasSessions ? 8 : 12, checks: 6, sessions: 4, notes: 0 };
  }
  const optional = (hasChecks ? 1 : 0) + (hasSessions ? 1 : 0);
  if (optional === 0) return { desc: 8, checks: 0, sessions: 0, notes: 4 };
  if (optional === 1) return { desc: 5, checks: 4, sessions: 4, notes: 3 };
  return { desc: 3, checks: 3, sessions: 3, notes: 3 };
}

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

/**
 * Rich PR header shown in place of the plain title/subtitle when the modal is
 * opened for a PR. Renders the same labels and indicators as the PR list row
 * (PRCard) via the shared {@link prIndicators} components, so the two views stay
 * in lockstep: draft icon + Jira-linked title, a meta line (repo#number, author,
 * branch, diff stat), and the review/needs-action indicators plus GitHub labels.
 *
 * Review-state indicators (status pill / reason chips) are shown for open PRs
 * only — on a merged PR those flags are stale, matching the row's merged variant
 * which hides them too.
 */
function PrModalHeader({
  pr,
  jiraBaseUrl,
  url,
}: {
  pr: GitHubPR;
  jiraBaseUrl?: string;
  url?: string;
}) {
  const ticket = extractTicketKey(sourceFromPR(pr));
  const isMerged = !!pr.merged_at;
  const isNeedsAction = !isMerged && categorizeOpenPR(pr) === "needs-action";
  const hasDiff = typeof pr.additions === "number" || typeof pr.deletions === "number";
  const hasLabels = !!pr.labels && pr.labels.length > 0;
  const timeText = isMerged
    ? `merged ${formatRelativeTime(pr.merged_at!)}`
    : `opened ${formatRelativeTime(pr.created_at)} · updated ${formatRelativeTime(pr.updated_at)}`;

  return (
    <div className="pr-modal-header">
      <div className="pr-modal-title">
        <PRStateIcon pr={pr} size={18} />
        <span className="pr-modal-title-text">
          {renderTitleContent(pr.title, ticket, jiraBaseUrl)}
        </span>
      </div>

      <div className="pr-modal-meta">
        <span className="pr-modal-repo">
          {pr.repo_full_name}#{pr.number}
        </span>
        <span className="pr-modal-sep">{"·"}</span>
        <span>{pr.user.login}</span>
        <span className="pr-modal-sep">{"·"}</span>
        <BranchPill head={pr.head.ref} base={pr.base.ref} />
        {hasDiff && (
          <>
            <span className="pr-modal-sep">{"·"}</span>
            <DiffStat pr={pr} />
          </>
        )}
        {isMerged && pr.merged_by && (
          <>
            <span className="pr-modal-sep">{"·"}</span>
            <span>merged by {pr.merged_by}</span>
          </>
        )}
      </div>

      {(!isMerged || hasLabels) && (
        <div className="pr-modal-indicators">
          {!isMerged && (isNeedsAction ? <ReasonChips pr={pr} /> : <StatusPill pr={pr} />)}
          {hasLabels && <PRLabels labels={pr.labels!} />}
        </div>
      )}

      <div className="pr-modal-time">{timeText}</div>

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="pr-modal-url text-truncate-custom"
          title={url}
        >
          {url}
        </a>
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
  /** When true and no description is available yet, show a loading spinner in the body. */
  loading?: boolean;
  url?: string;
  /** Jira base URL, used to link the ticket in the PR header title. */
  jiraBaseUrl?: string;
  checks?: CheckRunInfo[];
  activeSessions?: ClaudeSession[];
  onViewSession?: (sessionId: string) => void;
  pr?: GitHubPR;
  claudeEnabled?: boolean;
  onClaudeAction?: (action: ClaudeAction, customPrompt?: string) => void;
}

export const DescriptionModal: React.FC<DescriptionModalProps> = ({
  show,
  onHide,
  title,
  subtitle,
  description,
  loading,
  url,
  jiraBaseUrl,
  checks,
  activeSessions,
  onViewSession,
  pr,
  claudeEnabled,
  onClaudeAction,
}) => {
  const sortedChecks =
    checks && checks.length > 0
      ? [...checks].sort(
          (a, b) => (CHECK_SORT_ORDER[a.status] ?? 9) - (CHECK_SORT_ORDER[b.status] ?? 9),
        )
      : null;

  const hasChecks = !!sortedChecks;
  const hasActiveSessions = !!activeSessions && activeSessions.length > 0;
  const hasNotes = !!pr;
  const widths = columnWidths(hasChecks, hasActiveSessions, hasNotes);
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
      <Modal.Header>
        <br />
      </Modal.Header>

      <Modal.Body className="modal-tab-content">
        <div
          className="modal-title-section"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            {pr ? (
              <PrModalHeader pr={pr} jiraBaseUrl={jiraBaseUrl} url={url} />
            ) : (
              <>
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
              </>
            )}
          </div>
          {pr && claudeEnabled && onClaudeAction && (
            <ClaudeActionDropdown
              pr={pr}
              activeSessions={activeSessions}
              onViewSession={(sessionId) => {
                onViewSession?.(sessionId);
                onHide();
              }}
              onAction={onClaudeAction}
            />
          )}
        </div>

        <Row className="g-0 modal-split-layout">
          <Col md={widths.desc} className="modal-description-col">
            <div className="modal-body-section-header">Description</div>
            {loading && !description ? (
              <div className="d-flex align-items-center gap-2 text-secondary-custom">
                <Spinner animation="border" size="sm" variant="secondary" />
                <span style={{ fontSize: "0.8125rem" }}>Loading…</span>
              </div>
            ) : description ? (
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
            <Col md={widths.checks} className="modal-checks-col">
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
            <Col md={widths.sessions} className="modal-checks-col">
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
          {pr && (
            <Col md={widths.notes} className="modal-notes-col">
              <PrNotesPanel pr={pr} />
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
