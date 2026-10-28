import React, { useContext, useState } from "react";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import { prAction, restatedReasons } from "../utils/prAction";
import Modal from "react-bootstrap/Modal";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { IconChevronRight, IconCopy, IconExternalLink, IconX } from "@tabler/icons-react";
import { CheckRunInfo } from "../types";
import type { GitHubPR } from "../types";
import { STATUS_CONFIG } from "./ChecksStatusIcon";
import { MergeButton } from "./MergeButton";
import { PrNotesPanel } from "./PrNotesPanel";
import { Toast } from "./Toast";
import { useIsPhone } from "../hooks/useIsPhone";
import { usePRCopyActions } from "../hooks/usePRCopyActions";
import { checkRunDuration, formatRelativeTime } from "../utils/time";
import { ticketKeyOf } from "../utils/tickets";
import { categorizeOpenPR } from "../utils/prCategories";
import {
  BranchPill,
  DiffStat,
  Participants,
  PRLabels,
  PRStateIcon,
  ActionPill,
  ReasonChips,
  StatusPill,
  renderTitleContent,
} from "./prIndicators";
import { Markdown } from "./Markdown";
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

/** Names for CHECK_SORT_ORDER's ranks, worst first. */
const CHECK_RANKS = ["failing", "running", "passed", "skipped"];

/** "1 failing · 2 running · 11 passed": a count per rank, worst first, skipping empty ranks. */
function checksSummary(checks: CheckRunInfo[]): string {
  const counts = CHECK_RANKS.map(() => 0);
  for (const c of checks) counts[Math.min(CHECK_SORT_ORDER[c.status] ?? 3, 3)]++;
  return CHECK_RANKS.flatMap((rank, i) => (counts[i] ? [`${counts[i]} ${rank}`] : [])).join(" · ");
}

function columnWidths(hasChecks: boolean, hasNotes: boolean) {
  if (!hasNotes) {
    return { desc: hasChecks ? 8 : 12, checks: 4, notes: 0 };
  }
  if (!hasChecks) return { desc: 8, checks: 0, notes: 4 };
  return { desc: 6, checks: 3, notes: 3 };
}

function CheckRunRow({ check }: { check: CheckRunInfo }) {
  const config = STATUS_CONFIG[check.status];
  const Icon = config?.icon;
  const color = config?.color || "#8b949e";
  const label = config?.title || check.status;
  const duration = checkRunDuration(check.started_at, check.completed_at);

  return (
    <div className="check-run-row">
      {Icon && <Icon size={14} stroke={1.8} color={color} />}
      <span
        style={{ flex: 1, fontSize: "0.8125rem", minWidth: 0 }}
        className="text-truncate-custom"
      >
        {check.name}
      </span>
      {duration && (
        <span
          className="text-secondary-custom check-run-duration"
          title={duration.running ? "Running for" : "Run time"}
        >
          {duration.running ? `${duration.label}…` : duration.label}
        </span>
      )}
      <span className="text-secondary-custom" style={{ fontSize: "0.75rem", flexShrink: 0 }}>
        {label}
      </span>
      <div className="check-run-actions">
        {check.url && (
          <a
            href={check.url}
            target="_blank"
            rel="noopener noreferrer"
            className="check-run-action-btn"
            title="Open in GitHub"
          >
            <IconExternalLink size={14} stroke={1.5} />
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Phone: the checks fold into one summary line, led by the worst status's icon,
 * that opens the full list. `checks` comes sorted worst first.
 */
function PhoneChecks({ checks }: { checks: CheckRunInfo[] }) {
  const [open, setOpen] = useState(false);
  const worst = STATUS_CONFIG[checks[0].status];
  const Icon = worst?.icon;
  return (
    <section className="modal-phone-section">
      <div className="modal-body-section-header">Checks</div>
      <button
        type="button"
        className="modal-checks-summary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {Icon && <Icon size={14} stroke={1.8} color={worst.color} aria-hidden="true" />}
        <span className="modal-checks-summary-text">{checksSummary(checks)}</span>
        <IconChevronRight size={14} aria-hidden="true" className="modal-checks-summary-chevron" />
      </button>
      {open && (
        <div className="modal-checks-summary-list">
          {checks.map((check, i) => (
            <CheckRunRow key={`${check.name}-${i}`} check={check} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Phone: a slim bar above the one scroll, in place of the footer's Close:
 * the PR ref, copy link (to paste the PR elsewhere), open on GitHub, and ✕.
 */
function PhoneTopBar({
  label,
  url,
  isPR,
  onHide,
}: {
  label: string;
  url?: string;
  isPR: boolean;
  onHide: () => void;
}) {
  const { copy, toast } = usePRCopyActions();
  return (
    <div className="modal-phone-bar">
      <span className="modal-phone-bar-ref">{label}</span>
      {url && (
        <>
          <button
            type="button"
            className="modal-phone-bar-btn"
            aria-label="Copy link"
            title="Copy link"
            onClick={() =>
              copy(url, isPR ? "Copied PR link to clipboard" : "Copied link to clipboard")
            }
          >
            <IconCopy size={16} aria-hidden="true" />
          </button>
          <a
            className="modal-phone-bar-btn"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={isPR ? "Open on GitHub" : "Open link"}
            title={isPR ? "Open on GitHub" : "Open link"}
          >
            <IconExternalLink size={16} aria-hidden="true" />
          </a>
        </>
      )}
      <button
        type="button"
        className="modal-phone-bar-btn"
        aria-label="Close"
        title="Close"
        onClick={onHide}
      >
        <IconX size={18} aria-hidden="true" />
      </button>
      <Toast message={toast.message} visible={toast.visible} />
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
 * Review-state indicators are shown for open PRs only: needs-action PRs get
 * their reason chips; the rest get the status pill plus any softer reasons
 * (unresolved threads, no reviewer). On a merged PR those flags are stale,
 * matching the row's merged variant which hides them too.
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
  const ticket = ticketKeyOf(pr);
  const isMerged = !!pr.merged_at;
  const isNeedsAction = !isMerged && categorizeOpenPR(pr) === "needs-action";
  const viewer = useContext(ViewerLoginContext);
  const action = isMerged ? null : prAction(pr, viewer);
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
          <a href={url} target="_blank" rel="noopener noreferrer" title={url}>
            {pr.repo_full_name}#{pr.number}
          </a>
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
        {pr.participants && pr.participants.length > 0 && (
          <>
            <span className="pr-modal-sep">{"·"}</span>
            <Participants pr={pr} max={8} />
          </>
        )}
        {isMerged && pr.approved_by && pr.approved_by.length > 0 && (
          <>
            <span className="pr-modal-sep">{"·"}</span>
            <span>approved by {pr.approved_by.join(", ")}</span>
          </>
        )}
        {isMerged && pr.merged_by && (
          <>
            <span className="pr-modal-sep">{"·"}</span>
            <span>merged by {pr.merged_by}</span>
          </>
        )}
        <span className="pr-modal-sep">{"·"}</span>
        <span className="pr-modal-time">{timeText}</span>
      </div>

      {(!isMerged || hasLabels) && (
        <div className="pr-modal-indicators">
          {/* On my own ready PR, "Ready to merge" becomes the Merge button. */}
          {action && (
            <MergeButton
              pr={pr}
              fallback={<ActionPill label={action.label} tone={action.tone} />}
            />
          )}
          {!isMerged && !isNeedsAction && !action && <StatusPill pr={pr} />}
          {!isMerged && <ReasonChips pr={pr} except={restatedReasons(action)} />}
          {hasLabels && <PRLabels labels={pr.labels!} />}
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
  /** When true and no description is available yet, show a loading spinner in the body. */
  loading?: boolean;
  url?: string;
  /** Jira base URL, used to link the ticket in the PR header title. */
  jiraBaseUrl?: string;
  checks?: CheckRunInfo[];
  pr?: GitHubPR;
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
  pr,
}) => {
  const sortedChecks =
    checks && checks.length > 0
      ? [...checks].sort(
          (a, b) => (CHECK_SORT_ORDER[a.status] ?? 9) - (CHECK_SORT_ORDER[b.status] ?? 9),
        )
      : null;

  const hasChecks = !!sortedChecks;
  const hasNotes = !!pr;
  const widths = columnWidths(hasChecks, hasNotes);
  // Phone: one scroll (checks summary, description, notes) under a slim top bar.
  const phone = useIsPhone();

  const descriptionBody =
    loading && !description ? (
      <div className="d-flex align-items-center gap-2 text-secondary-custom">
        <Spinner animation="border" size="sm" variant="secondary" />
        <span style={{ fontSize: "0.8125rem" }}>Loading…</span>
      </div>
    ) : description ? (
      <Markdown>{description}</Markdown>
    ) : (
      <p className="text-secondary-custom" style={{ fontStyle: "italic" }}>
        No description provided.
      </p>
    );

  return (
    <Modal
      show={show}
      onHide={onHide}
      fullscreen
      className={`description-modal description-modal--fullscreen${phone ? " description-modal--phone" : ""}`}
    >
      {phone && (
        <PhoneTopBar
          label={pr ? `${pr.repo_full_name.split("/").pop()}#${pr.number}` : ""}
          url={url ?? pr?.html_url}
          isPR={!!pr}
          onHide={onHide}
        />
      )}
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
        </div>

        {phone ? (
          <>
            {hasChecks && <PhoneChecks checks={sortedChecks!} />}
            <section className="modal-phone-section">
              <div className="modal-body-section-header">Description</div>
              {descriptionBody}
            </section>
            {pr && (
              <section className="modal-phone-section">
                <PrNotesPanel pr={pr} />
              </section>
            )}
          </>
        ) : (
          <Row className="g-0 modal-split-layout">
            <Col md={widths.desc} className="modal-description-col">
              <div className="modal-body-section-header">Description</div>
              {descriptionBody}
            </Col>
            {hasChecks && (
              <Col md={widths.checks} className="modal-checks-col">
                <div className="checks-list-view">
                  <div className="modal-body-section-header">Checks</div>
                  {sortedChecks!.map((check, i) => (
                    <CheckRunRow key={`${check.name}-${i}`} check={check} />
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
        )}
      </Modal.Body>

      {!phone && (
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={onHide}>
            Close
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
};
