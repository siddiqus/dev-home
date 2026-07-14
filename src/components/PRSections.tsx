import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { IconChevronRight, IconChevronDown } from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../types";
import type { ClaudeAction, ClaudeSession } from "../types/claude";
import { PRTable } from "./PRTable";
import { OPEN_PR_SECTIONS, groupPRsBySection, OpenPRSection } from "../utils/prCategories";
import { groupByTicket } from "../utils/tickets";
import "./PRSections.css";

interface PRSectionsProps {
  prs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
  jiraBaseUrl?: string;
  claudeEnabled?: boolean;
  claudeSessions?: ClaudeSession[];
  onClaudeAction?: (
    pr: {
      number: number;
      repo_full_name: string;
      title: string;
      headBranch: string;
      baseBranch: string;
    },
    action: ClaudeAction,
    customPrompt?: string,
  ) => void;
  onViewClaudeSession?: (sessionId: string) => void;
  /** Reports whether any collapsible Jira ticket groups exist across the section
      tables, and whether all of them are currently collapsed. */
  onCollapseStateChange?: (hasGroups: boolean, allCollapsed: boolean) => void;
}

export interface PRSectionsHandle {
  /** Whether any collapsible Jira ticket group exists across all section tables. */
  hasGroups: boolean;
  /** Whether every Jira ticket group across all section tables is collapsed. */
  allCollapsed: boolean;
  /** Collapse all Jira ticket groups (or expand them all if already collapsed). */
  toggleCollapseAll: () => void;
}

const STORAGE_KEY = "dev-home-myprs-section-collapsed";
const TICKET_STORAGE_KEY = "dev-home-myprs-ticket-collapsed";

/**
 * Splits the "My PRs" open list into state-based collapsible sections (Ready to
 * merge / Needs action / Pending review / Drafts), each wrapping a PRTable.
 * Empty sections are hidden; loading/empty is delegated to a single PRTable so the
 * existing spinner and empty-state UI are reused unchanged.
 */
export const PRSections = forwardRef<PRSectionsHandle, PRSectionsProps>(function PRSections(
  {
    prs,
    loading,
    jiraIssues,
    jiraBaseUrl,
    claudeEnabled,
    claudeSessions,
    onClaudeAction,
    onViewClaudeSession,
    onCollapseStateChange,
  },
  ref,
) {
  const [collapsed, setCollapsed] = useState<Set<OpenPRSection>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
    } catch {
      /* quota exceeded */
    }
  }, [collapsed]);

  // Collapsed Jira ticket groups, shared across every section's table. Ticket
  // keys are globally unique, so one set drives all tables uniformly.
  const [collapsedTickets, setCollapsedTickets] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(TICKET_STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(TICKET_STORAGE_KEY, JSON.stringify([...collapsedTickets]));
    } catch {
      /* quota exceeded */
    }
  }, [collapsedTickets]);

  const grouped = useMemo(() => groupPRsBySection(prs), [prs]);
  const visibleSections = useMemo(
    () => OPEN_PR_SECTIONS.filter((s) => grouped[s.id].length > 0),
    [grouped],
  );

  const toggleSection = (id: OpenPRSection) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // All collapsible ticket groups (>1 PR) across every visible section. These are
  // the groups the "collapse/expand all" button acts on.
  const allGroupTickets = useMemo(() => {
    const tickets = new Set<string>();
    for (const section of visibleSections) {
      for (const group of groupByTicket(grouped[section.id])) {
        if (group.ticket && group.prs.length > 1) tickets.add(group.ticket);
      }
    }
    return tickets;
  }, [visibleSections, grouped]);

  const hasGroups = allGroupTickets.size > 0;
  const allCollapsed = hasGroups && [...allGroupTickets].every((t) => collapsedTickets.has(t));

  const toggleTicket = useCallback((ticket: string) => {
    setCollapsedTickets((prev) => {
      const next = new Set(prev);
      if (next.has(ticket)) {
        next.delete(ticket);
      } else {
        next.add(ticket);
      }
      return next;
    });
  }, []);

  const toggleCollapseAll = useCallback(() => {
    setCollapsedTickets(allCollapsed ? new Set() : new Set(allGroupTickets));
  }, [allCollapsed, allGroupTickets]);

  useImperativeHandle(ref, () => ({ hasGroups, allCollapsed, toggleCollapseAll }), [
    hasGroups,
    allCollapsed,
    toggleCollapseAll,
  ]);

  // Keep the latest callback in a ref so the notify-effect depends only on the
  // reported values, not the callback's identity. Depending on the callback
  // (which callers pass inline) would re-run the effect every render and, since
  // it sets parent state, spin an infinite render loop.
  const onCollapseStateChangeRef = useRef(onCollapseStateChange);
  onCollapseStateChangeRef.current = onCollapseStateChange;

  useEffect(() => {
    onCollapseStateChangeRef.current?.(hasGroups, allCollapsed);
  }, [hasGroups, allCollapsed]);

  // No PRs yet: delegate to a single PRTable so its spinner / empty-state render.
  if (prs.length === 0) {
    return (
      <PRTable
        prs={[]}
        loading={loading}
        variant="my-prs"
        jiraIssues={jiraIssues}
        jiraBaseUrl={jiraBaseUrl}
      />
    );
  }

  return (
    <div className="pr-sections">
      {visibleSections.map((section) => {
        const bucket = grouped[section.id];
        const isCollapsed = collapsed.has(section.id);
        const Icon = section.icon;
        return (
          <section className="pr-section" key={section.id}>
            <button
              type="button"
              className="pr-section-header"
              onClick={() => toggleSection(section.id)}
              aria-expanded={!isCollapsed}
            >
              <span className="pr-section-chevron">
                {isCollapsed ? (
                  <IconChevronRight size={16} stroke={2} />
                ) : (
                  <IconChevronDown size={16} stroke={2} />
                )}
              </span>
              <Icon
                size={16}
                stroke={1.8}
                className="pr-section-icon"
                style={{ color: `var(${section.colorVar})` }}
              />
              <span className="pr-section-label">{section.label}</span>
              <span className="pr-section-count">{bucket.length}</span>
            </button>
            {!isCollapsed && (
              <PRTable
                prs={bucket}
                loading={false}
                variant="my-prs"
                jiraIssues={jiraIssues}
                jiraBaseUrl={jiraBaseUrl}
                claudeEnabled={claudeEnabled}
                claudeSessions={claudeSessions}
                onClaudeAction={onClaudeAction}
                onViewClaudeSession={onViewClaudeSession}
                showGroupToolbar={false}
                storageKeyScope={section.id}
                collapsedGroups={collapsedTickets}
                onToggleGroup={toggleTicket}
              />
            )}
          </section>
        );
      })}
    </div>
  );
});
