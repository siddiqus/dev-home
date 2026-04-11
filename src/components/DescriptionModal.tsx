import React from "react";
import Modal from "react-bootstrap/Modal";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { CheckRunInfo } from "../types";
import { STATUS_CONFIG } from "./ChecksStatusIcon";

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

function CheckRunRow({ check }: { check: CheckRunInfo }) {
  const config = STATUS_CONFIG[check.status];
  const Icon = config?.icon;
  const color = config?.color || "#8b949e";
  const label = config?.title || check.status;

  return (
    <div className="d-flex align-items-center gap-2 py-1">
      {Icon && <Icon size={14} stroke={1.8} color={color} />}
      <span
        style={{ flex: 1, fontSize: "0.8125rem", minWidth: 0 }}
        className="text-truncate-custom"
      >
        {check.url ? (
          <a
            href={check.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {check.name}
          </a>
        ) : (
          check.name
        )}
      </span>
      <span className="text-secondary-custom" style={{ fontSize: "0.75rem", flexShrink: 0 }}>
        {label}
      </span>
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
}

export const DescriptionModal: React.FC<DescriptionModalProps> = ({
  show,
  onHide,
  title,
  subtitle,
  description,
  url,
  checks,
}) => {
  const sortedChecks =
    checks && checks.length > 0
      ? [...checks].sort(
          (a, b) => (CHECK_SORT_ORDER[a.status] ?? 9) - (CHECK_SORT_ORDER[b.status] ?? 9),
        )
      : null;

  return (
    <Modal show={show} onHide={onHide} size="lg" centered className="description-modal">
      <Modal.Header closeButton>
        <Modal.Title>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>{title}</div>
            {subtitle && (
              <div
                className="text-secondary-custom"
                style={{ fontSize: "0.75rem", fontWeight: 400, marginTop: 2 }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </Modal.Title>
      </Modal.Header>
      {sortedChecks && (
        <div className="modal-checks-section">
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.03em",
              marginBottom: 8,
            }}
          >
            Checks
          </div>
          {sortedChecks.map((check, i) => (
            <CheckRunRow key={`${check.name}-${i}`} check={check} />
          ))}
        </div>
      )}
      <Modal.Body>
        {description ? (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkBreaks]}>{description}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-secondary-custom" style={{ fontStyle: "italic" }}>
            No description provided.
          </p>
        )}
      </Modal.Body>
      {url && (
        <Modal.Footer>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8125rem" }}>
            Open in browser
          </a>
        </Modal.Footer>
      )}
    </Modal>
  );
};
