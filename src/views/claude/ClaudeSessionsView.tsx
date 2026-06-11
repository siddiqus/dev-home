import React, { useState, useRef, useEffect } from "react";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { IconArrowLeft, IconExternalLink } from "@tabler/icons-react";
import type { ClaudeSession } from "../../types/claude";
import { CLAUDE_ACTION_LABELS } from "../../types/claude";
import { useClaudeWebSocket } from "../../hooks/useClaudeWebSocket";
import { formatRelativeTime } from "../../utils/time";
import "./ClaudeSessionsView.css";

interface ClaudeSessionsViewProps {
  sessions: ClaudeSession[];
  loading: boolean;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  initialSessionId?: string | null;
}

type FilterTab = "active" | "completed" | "all";

export const ClaudeSessionsView: React.FC<ClaudeSessionsViewProps> = ({
  sessions,
  loading,
  onCancel,
  onDelete,
  initialSessionId,
}) => {
  const [filter, setFilter] = useState<FilterTab>("active");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSessionId || null,
  );

  useEffect(() => {
    if (initialSessionId) setSelectedSessionId(initialSessionId);
  }, [initialSessionId]);

  const filteredSessions = sessions.filter((s) => {
    if (filter === "active") return s.status === "running";
    if (filter === "completed") return s.status !== "running";
    return true;
  });

  const activeSessions = sessions.filter((s) => s.status === "running");
  const completedSessions = sessions.filter((s) => s.status !== "running");

  if (selectedSessionId) {
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (!session) {
      setSelectedSessionId(null);
      return null;
    }
    return (
      <SessionDetailView
        session={session}
        onBack={() => setSelectedSessionId(null)}
        onCancel={() => onCancel(session.id)}
      />
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h5 className="mb-0" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Claude Sessions
        </h5>
      </div>

      <div className="d-flex gap-2 mb-3">
        <Button
          size="sm"
          variant={filter === "active" ? "primary" : "outline-secondary"}
          onClick={() => setFilter("active")}
          className="rounded-pill"
        >
          Active ({activeSessions.length})
        </Button>
        <Button
          size="sm"
          variant={filter === "completed" ? "primary" : "outline-secondary"}
          onClick={() => setFilter("completed")}
          className="rounded-pill"
        >
          Completed ({completedSessions.length})
        </Button>
        <Button
          size="sm"
          variant={filter === "all" ? "primary" : "outline-secondary"}
          onClick={() => setFilter("all")}
          className="rounded-pill"
        >
          All
        </Button>
      </div>

      {loading && sessions.length === 0 && (
        <div className="d-flex justify-content-center py-5">
          <Spinner animation="border" variant="secondary" />
        </div>
      )}

      {!loading && filteredSessions.length === 0 && (
        <div className="text-center py-5 text-secondary-custom">
          <p>No {filter === "all" ? "" : filter} sessions</p>
          <p style={{ fontSize: "0.8rem" }}>Use the Claude button on a PR to start a session</p>
        </div>
      )}

      <div className="claude-sessions-list">
        {filteredSessions.map((session) => (
          <div
            key={session.id}
            className={`claude-session-card${session.status === "running" ? " active" : ""}`}
          >
            <div className="d-flex align-items-center justify-content-between mb-1">
              <div className="d-flex align-items-center gap-2">
                <span className={`claude-status-dot ${session.status}`} />
                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                  {CLAUDE_ACTION_LABELS[session.action]}
                </span>
                <Badge bg="secondary" className="fw-normal" style={{ fontSize: "0.7rem" }}>
                  {session.repoFullName}
                </Badge>
                {session.status !== "running" && (
                  <Badge
                    bg={
                      session.status === "completed"
                        ? "success"
                        : session.status === "cancelled"
                          ? "warning"
                          : "danger"
                    }
                    style={{ fontSize: "0.65rem" }}
                  >
                    {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                  </Badge>
                )}
              </div>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setSelectedSessionId(session.id)}
                  style={{ fontSize: "0.75rem" }}
                >
                  View
                </Button>
                {session.status === "running" ? (
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => onCancel(session.id)}
                    style={{ fontSize: "0.75rem" }}
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => onDelete(session.id)}
                    style={{ fontSize: "0.75rem" }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <div className="text-secondary-custom" style={{ fontSize: "0.8rem" }}>
              <a
                href={`https://github.com/${session.repoFullName}/pull/${session.prNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: "inherit", textDecoration: "none" }}
                className="claude-pr-link"
              >
                PR #{session.prNumber}: {session.prTitle}{" "}
                <IconExternalLink size={11} stroke={1.5} style={{ opacity: 0.6 }} />
              </a>
            </div>
            {session.lastOutputLine && (
              <div className="claude-session-preview">▶ {session.lastOutputLine}</div>
            )}
            <div className="text-secondary-custom" style={{ fontSize: "0.7rem", marginTop: 4 }}>
              {session.status === "running"
                ? `Started ${formatRelativeTime(session.startedAt)}`
                : `${session.status === "completed" ? "Completed" : session.status === "cancelled" ? "Cancelled" : "Errored"} ${formatRelativeTime(session.completedAt!)}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface SessionDetailViewProps {
  session: ClaudeSession;
  onBack: () => void;
  onCancel: () => void;
}

const SessionDetailView: React.FC<SessionDetailViewProps> = ({ session, onBack, onCancel }) => {
  const { output, done, exitCode, duration, sendInput } = useClaudeWebSocket(session.id);
  const [inputValue, setInputValue] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleSendInput = () => {
    if (inputValue.trim()) {
      sendInput(inputValue.trim());
      setInputValue("");
    }
  };

  const isRunning = session.status === "running" && !done;

  return (
    <div className="claude-session-detail">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-3">
          <Button variant="outline-secondary" size="sm" onClick={onBack}>
            <IconArrowLeft size={14} />
          </Button>
          <span style={{ fontWeight: 600 }}>{CLAUDE_ACTION_LABELS[session.action]}</span>
          <a
            href={`https://github.com/${session.repoFullName}/pull/${session.prNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="claude-pr-link"
            style={{
              color: "var(--color-text-secondary)",
              textDecoration: "none",
              fontSize: "0.8rem",
            }}
          >
            PR #{session.prNumber} · {session.prTitle}{" "}
            <IconExternalLink size={11} stroke={1.5} style={{ opacity: 0.6 }} />
          </a>
        </div>
        {isRunning && (
          <Button variant="outline-danger" size="sm" onClick={onCancel}>
            Cancel Session
          </Button>
        )}
      </div>

      <div className="claude-terminal" ref={outputRef}>
        {output.map((line, i) => (
          <div key={i} className={`claude-terminal-line ${line.stream}`}>
            {line.data}
          </div>
        ))}
        {isRunning && <span className="claude-cursor">█</span>}
        {done && (
          <div className="claude-terminal-done">
            {exitCode === 0 ? "✓ Session completed" : `✗ Session ended with exit code ${exitCode}`}
            {duration != null && ` (${Math.round(duration / 1000)}s)`}
          </div>
        )}
      </div>

      <div className="claude-input-bar">
        <Form.Control
          type="text"
          size="sm"
          placeholder={isRunning ? "Send a follow-up message to Claude..." : "Session ended"}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSendInput();
          }}
          disabled={!isRunning}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleSendInput}
          disabled={!isRunning || !inputValue.trim()}
        >
          Send
        </Button>
      </div>
    </div>
  );
};
