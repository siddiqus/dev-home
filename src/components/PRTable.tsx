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
  IconFold,
  IconFoldDown,
} from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../types";
import { groupByTicket } from "../utils/tickets";
import { categorizeOpenPR } from "../utils/prCategories";
import type { StateBadge } from "../views/workday/prState";
import { EmptyState } from "./EmptyState";
import { PRCard, PRCardFields } from "./PRCard";
import { PRDetailModal } from "./PRDetailModal";
import { TicketGroupHeader } from "./TicketGroupHeader";
import { Toast } from "./Toast";
import { usePersistedSet } from "../hooks/usePersistedSet";
import { usePRCopyActions } from "../hooks/usePRCopyActions";
import { usePRNoteCounts } from "../hooks/usePRNoteCounts";
import "./PRTable.css";

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
  /** Derive a per-row action pill (e.g. the Reviews tab's reviewer state). */
  actionPill?: (pr: GitHubPR) => StateBadge | null;
}

/** Which card fields each variant shows. */
export const VARIANT_FIELDS: Record<PRTableVariant, PRCardFields> = {
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

/** Stable default so the ticketIssues memo isn't invalidated every render. */
const NO_ISSUES: JiraIssue[] = [];

export interface PRTableHandle {
  hasGroups: boolean;
  allCollapsed: boolean;
  toggleCollapseAll: () => void;
}

export const PRTable = forwardRef<PRTableHandle, PRTableProps>(function PRTable(
  {
    prs,
    loading,
    jiraIssues = NO_ISSUES,
    jiraBaseUrl = "",
    variant,
    onCollapseStateChange,
    showGroupToolbar = true,
    embedded = false,
    storageKeyScope,
    collapsedGroups,
    onToggleGroup,
    reasonChips,
    actionPill,
  },
  ref,
) {
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const { onCopyBranch, onCopyLink, onCopyRef, onCopyTicket, toast } = usePRCopyActions();
  const noteCount = usePRNoteCounts();

  // Controlled when the parent supplies `collapsedGroups`; otherwise the table
  // owns its own localStorage-backed collapse state.
  const storageKey = `dev-home-pr-collapsed-${variant}${storageKeyScope ? `-${storageKeyScope}` : ""}`;
  const [internalCollapsed, setInternalCollapsed, toggleInternal] = usePersistedSet(
    collapsedGroups ? null : storageKey,
  );
  const collapsed = collapsedGroups ?? internalCollapsed;
  const toggleGroup = onToggleGroup ?? toggleInternal;

  const fields = VARIANT_FIELDS[variant];

  const ticketIssues = useMemo(
    () => new Map(jiraIssues.map((issue) => [issue.key.toUpperCase(), issue])),
    [jiraIssues],
  );

  const groups = useMemo(() => groupByTicket(prs), [prs]);
  const groupTickets = useMemo(
    () => groups.filter((g) => g.ticket !== null).map((g) => g.ticket!),
    [groups],
  );
  const hasGroups = groupTickets.length > 0;
  const allCollapsed = hasGroups && groupTickets.every((t) => collapsed.has(t));

  const toggleCollapseAll = useCallback(() => {
    setInternalCollapsed(allCollapsed ? new Set() : new Set(groupTickets));
  }, [allCollapsed, groupTickets, setInternalCollapsed]);

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
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (prs.length === 0) {
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
          // Every ticketed PR sits under a header — even a lone one — so the
          // ticket summary shows and the chip opens the Jira drawer.
          const isCluster = group.ticket !== null;
          const isCollapsed = isCluster && collapsed.has(group.ticket!);
          const issue = group.ticket ? ticketIssues.get(group.ticket.toUpperCase()) : undefined;
          const groupKey = group.ticket ?? `ungrouped-${groupIdx}`;
          return (
            <React.Fragment key={groupKey}>
              {isCluster && (
                <TicketGroupHeader
                  ticket={group.ticket}
                  jiraBaseUrl={jiraBaseUrl}
                  summary={issue?.summary}
                  onCopyKey={onCopyTicket}
                  count={group.prs.length}
                  // Jira's updated time, else the newest PR (groups are updated_at DESC).
                  updatedAt={issue?.updated || group.prs[0].updated_at}
                  collapsed={isCollapsed}
                  onToggle={() => toggleGroup(group.ticket!)}
                />
              )}
              {!isCollapsed &&
                group.prs.map((pr) => (
                  <PRCard
                    key={pr.id}
                    pr={pr}
                    fields={fields}
                    jiraBaseUrl={jiraBaseUrl}
                    clustered={isCluster}
                    showReasonChips={!!reasonChips && categorizeOpenPR(pr) === "needs-action"}
                    actionPill={actionPill?.(pr)}
                    noteCount={noteCount(pr)}
                    onOpen={setSelectedPR}
                    onCopyBranch={onCopyBranch}
                    onCopyLink={onCopyLink}
                    onCopyRef={onCopyRef}
                  />
                ))}
            </React.Fragment>
          );
        })}
      </div>

      <PRDetailModal pr={selectedPR} onHide={() => setSelectedPR(null)} jiraBaseUrl={jiraBaseUrl} />

      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
});
