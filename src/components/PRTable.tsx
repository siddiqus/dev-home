import React, {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useRef,
  useMemo,
} from "react";
import Spinner from "react-bootstrap/Spinner";
import {
  IconGitPullRequest,
  IconEye,
  IconBuilding,
  IconChevronRight,
  IconChevronDown,
  IconFold,
  IconFoldDown,
} from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../types";
import { formatRelativeTime } from "../utils/time";
import { groupByTicket } from "../utils/tickets";
import { categorizeOpenPR } from "../utils/prCategories";
import { DescriptionModal } from "./DescriptionModal";
import { EmptyState } from "./EmptyState";
import { PRCard, PRCardFields } from "./PRCard";
import { useOptionalNotes } from "../context/NotesContext";
import { normalizeNoteRef, prNoteKey } from "../utils/prNotes";
import "./PRTable.css";
import { jiraBrowseUrl } from "../utils/tickets";
import { Toast, useToast } from "./Toast";

type PRTableVariant =
  | "my-prs"
  | "review-requests"
  | "org-prs"
  | "recently-merged"
  | "recently-merged-org";

interface PRTableProps {
  prs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
  jiraBaseUrl?: string;
  variant: PRTableVariant;
  onCollapseStateChange?: (hasGroups: boolean, allCollapsed: boolean) => void;
  /** Set false to hide the inline "collapse all groups" toolbar (e.g. inside PRSections). */
  showGroupToolbar?: boolean;
  /** True when rendered inside an outer container that already provides the card
      chrome (PRSections' section card). Skips PRTable's own container card so the
      PR rows sit directly inside the section — no card-within-a-card nesting. */
  embedded?: boolean;
  /** Extra scope appended to the ticket-collapse localStorage key so multiple
      tables of the same variant (one per section) don't clobber each other. */
  storageKeyScope?: string;
  /** Controlled ticket-collapse: when provided, the parent owns which ticket
      groups are collapsed (e.g. PRSections drives one shared set across all its
      section tables). Falls back to internal, localStorage-backed state when omitted. */
  collapsedGroups?: Set<string>;
  /** Called when a ticket group header is clicked, in controlled mode. */
  onToggleGroup?: (ticket: string) => void;
  /** Enable the unified reason-chip row; chips render only on rows that
      categorize as "needs-action", so mixed lists (flat view) decorate the right
      rows and section tables naturally scope chips to the needs-action section. */
  reasonChips?: boolean;
}

/** Which card fields each variant shows. */
const VARIANT_FIELDS: Record<PRTableVariant, PRCardFields> = {
  "my-prs": {
    showAuthor: false,
    showBranch: true,
    showStatus: true,
    showChecks: true,
    timestamps: "open",
  },
  "review-requests": {
    showAuthor: true,
    showBranch: false,
    showStatus: false,
    showChecks: true,
    timestamps: "open",
  },
  "org-prs": {
    showAuthor: true,
    showBranch: true,
    showStatus: true,
    showChecks: true,
    timestamps: "open",
  },
  "recently-merged": {
    showAuthor: false,
    showBranch: true,
    showStatus: false,
    showChecks: false,
    timestamps: "merged",
  },
  "recently-merged-org": {
    showAuthor: true,
    showBranch: true,
    showStatus: false,
    showChecks: false,
    timestamps: "merged",
  },
};

/** Empty-state metadata per variant. */
const EMPTY_STATE: Record<
  PRTableVariant,
  { icon: React.ReactNode; title: string; description: string }
> = {
  "my-prs": {
    icon: <IconGitPullRequest size={40} stroke={1.5} />,
    title: "No open pull requests",
    description: "You don't have any open pull requests at the moment.",
  },
  "review-requests": {
    icon: <IconEye size={40} stroke={1.5} />,
    title: "No review requests",
    description: "No one has requested your review on any pull requests.",
  },
  "org-prs": {
    icon: <IconBuilding size={40} stroke={1.5} />,
    title: "No org pull requests",
    description: "No open, non-draft pull requests found for this org.",
  },
  "recently-merged": {
    icon: <IconGitPullRequest size={40} stroke={1.5} />,
    title: "No recently merged PRs",
    description: "No pull requests have been merged recently.",
  },
  "recently-merged-org": {
    icon: <IconGitPullRequest size={40} stroke={1.5} />,
    title: "No recently merged PRs",
    description: "No pull requests have been merged recently.",
  },
};

/** Ticket key rendered as a Jira link (or a plain chip when no Jira base URL).
    Used on cluster headers, where the key labels the whole group. */
function TicketChip({ ticket, jiraBaseUrl }: { ticket: string; jiraBaseUrl?: string }) {
  if (!jiraBaseUrl) return <span className="ticket-chip">{ticket}</span>;
  return (
    <a
      className="ticket-chip"
      href={jiraBrowseUrl(jiraBaseUrl, ticket)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      {ticket}
    </a>
  );
}

export interface PRTableHandle {
  hasGroups: boolean;
  allCollapsed: boolean;
  toggleCollapseAll: () => void;
}

export const PRTable = forwardRef<PRTableHandle, PRTableProps>(function PRTable(
  {
    prs,
    loading,
    jiraIssues = [],
    jiraBaseUrl = "",
    variant,
    onCollapseStateChange,
    showGroupToolbar = true,
    embedded = false,
    storageKeyScope,
    collapsedGroups,
    onToggleGroup,
    reasonChips,
  },
  ref,
) {
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  // Transient "copied to clipboard" confirmation.
  const copyToast = useToast();
  const showCopyToast = copyToast.show;

  const copyToClipboard = useCallback(
    (text: string, message: string) => {
      navigator.clipboard
        ?.writeText(text)
        .then(() => {
          showCopyToast(message);
        })
        .catch(() => {
          /* clipboard unavailable (e.g. insecure context) — silently ignore */
        });
    },
    [showCopyToast],
  );

  const handleCopyBranch = useCallback(
    (branch: string) => copyToClipboard(branch, "Copied branch name to clipboard"),
    [copyToClipboard],
  );

  const handleCopyLink = useCallback(
    (url: string) => copyToClipboard(url, "Copied PR link to clipboard"),
    [copyToClipboard],
  );

  const storageKey = `dev-home-pr-collapsed-${variant}${storageKeyScope ? `-${storageKeyScope}` : ""}`;
  // Controlled when the parent supplies `collapsedGroups`; otherwise the table
  // owns its own localStorage-backed collapse state.
  const isControlled = collapsedGroups !== undefined;
  const [internalCollapsed, setInternalCollapsed] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const collapsed = collapsedGroups ?? internalCollapsed;

  useEffect(() => {
    if (isControlled) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...internalCollapsed]));
    } catch {
      /* quota exceeded */
    }
  }, [internalCollapsed, storageKey, isControlled]);

  const isMergedVariant = variant === "recently-merged" || variant === "recently-merged-org";
  const fields = VARIANT_FIELDS[variant];

  const ticketTitles = new Map(jiraIssues.map((issue) => [issue.key.toUpperCase(), issue.summary]));

  const notesCtx = useOptionalNotes();
  const notes = notesCtx?.notes ?? [];

  const noteCountByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) {
      if (n.resolved !== 0) continue;
      const key = normalizeNoteRef(n.reference_id);
      if (!key) continue;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [notes]);

  const toggleGroup = (ticket: string) => {
    if (onToggleGroup) {
      onToggleGroup(ticket);
      return;
    }
    setInternalCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(ticket)) {
        next.delete(ticket);
      } else {
        next.add(ticket);
      }
      return next;
    });
  };

  const groups = groupByTicket(prs);
  const groupTickets = groups
    .filter((g) => g.ticket !== null && g.prs.length > 1)
    .map((g) => g.ticket!);
  const hasGroups = groupTickets.length > 0;
  const allCollapsed = hasGroups && groupTickets.every((t) => collapsed.has(t));

  const toggleCollapseAll = useCallback(() => {
    setInternalCollapsed(allCollapsed ? new Set() : new Set(groupTickets));
  }, [allCollapsed, groupTickets]);

  useImperativeHandle(ref, () => ({ hasGroups, allCollapsed, toggleCollapseAll }), [
    hasGroups,
    allCollapsed,
    toggleCollapseAll,
  ]);

  // Depend only on the reported values, not the callback identity (callers pass
  // it inline), so re-notifying can't spin a render loop. See PRSections.
  const onCollapseStateChangeRef = useRef(onCollapseStateChange);
  onCollapseStateChangeRef.current = onCollapseStateChange;

  useEffect(() => {
    onCollapseStateChangeRef.current?.(hasGroups, allCollapsed);
  }, [hasGroups, allCollapsed]);

  if (loading && prs.length === 0) {
    if (isMergedVariant) return null;
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (prs.length === 0) {
    if (isMergedVariant) return null;
    const empty = EMPTY_STATE[variant];
    return <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />;
  }

  const showInlineToolbar = hasGroups && !onCollapseStateChange && showGroupToolbar;

  return (
    <>
      {showInlineToolbar && (
        <div className="pr-table-toolbar">
          <button
            type="button"
            className="pr-table-collapse-btn"
            onClick={toggleCollapseAll}
            title={allCollapsed ? "Expand all groups" : "Collapse all groups"}
          >
            {allCollapsed ? <IconFoldDown size={14} /> : <IconFold size={14} />}
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        </div>
      )}

      <div className={embedded ? "pr-card-list" : "pr-list-card pr-card-list"}>
        {groups.map((group, groupIdx) => {
          const isCluster = group.ticket !== null && group.prs.length > 1;
          const isCollapsed = isCluster && collapsed.has(group.ticket!);
          const singleTicket =
            group.ticket !== null && group.prs.length === 1 ? group.ticket : null;
          const summary = group.ticket ? ticketTitles.get(group.ticket.toUpperCase()) : undefined;
          const groupKey = group.ticket ?? `ungrouped-${groupIdx}`;
          return (
            <React.Fragment key={groupKey}>
              {isCluster && (
                <div
                  className="pr-cluster-header"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroup(group.ticket!)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleGroup(group.ticket!);
                    }
                  }}
                >
                  <span className="pr-cluster-chevron">
                    {isCollapsed ? (
                      <IconChevronRight size={14} stroke={2} />
                    ) : (
                      <IconChevronDown size={14} stroke={2} />
                    )}
                  </span>
                  <TicketChip ticket={group.ticket!} jiraBaseUrl={jiraBaseUrl} />
                  {summary && <span className="pr-cluster-summary">{summary}</span>}
                  <span className="pr-cluster-count" title={`${group.prs.length} PRs`}>
                    {group.prs.length}
                  </span>
                </div>
              )}
              {!isCollapsed &&
                group.prs.map((pr) => (
                  <PRCard
                    key={pr.id}
                    pr={pr}
                    fields={fields}
                    jiraBaseUrl={jiraBaseUrl}
                    singleTicket={singleTicket}
                    clustered={isCluster}
                    showReasonChips={!!reasonChips && categorizeOpenPR(pr) === "needs-action"}
                    noteCount={noteCountByKey.get(prNoteKey(pr)) ?? 0}
                    onOpen={setSelectedPR}
                    onCopyBranch={handleCopyBranch}
                    onCopyLink={handleCopyLink}
                  />
                ))}
            </React.Fragment>
          );
        })}
      </div>

      <DescriptionModal
        show={!!selectedPR}
        onHide={() => setSelectedPR(null)}
        title={selectedPR ? `#${selectedPR.number} ${selectedPR.title}` : ""}
        subtitle={`${selectedPR?.user.login} · ${selectedPR?.repo_full_name} · ${selectedPR?.head.ref} · ${formatRelativeTime(selectedPR?.created_at || "")}`}
        description={selectedPR?.body || ""}
        url={selectedPR?.html_url}
        jiraBaseUrl={jiraBaseUrl}
        checks={selectedPR?.checks}
        pr={selectedPR ?? undefined}
      />

      <Toast message={copyToast.message} visible={copyToast.visible} />
    </>
  );
});
