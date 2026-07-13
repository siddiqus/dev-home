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
  /** Reports the number of visible (non-empty) sections and whether all are collapsed. */
  onCollapseStateChange?: (visibleSectionCount: number, allCollapsed: boolean) => void;
}

export interface PRSectionsHandle {
  visibleSectionCount: number;
  allCollapsed: boolean;
  toggleCollapseAll: () => void;
}

const STORAGE_KEY = "dev-home-myprs-section-collapsed";

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

  const grouped = useMemo(() => groupPRsBySection(prs), [prs]);
  const visibleSections = useMemo(
    () => OPEN_PR_SECTIONS.filter((s) => grouped[s.id].length > 0),
    [grouped],
  );

  const visibleSectionCount = visibleSections.length;
  const allCollapsed = visibleSectionCount > 0 && visibleSections.every((s) => collapsed.has(s.id));

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

  const toggleCollapseAll = useCallback(() => {
    if (allCollapsed) {
      setCollapsed(new Set());
    } else {
      setCollapsed(new Set(visibleSections.map((s) => s.id)));
    }
  }, [allCollapsed, visibleSections]);

  useImperativeHandle(ref, () => ({ visibleSectionCount, allCollapsed, toggleCollapseAll }), [
    visibleSectionCount,
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
    onCollapseStateChangeRef.current?.(visibleSectionCount, allCollapsed);
  }, [visibleSectionCount, allCollapsed]);

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
              />
            )}
          </section>
        );
      })}
    </div>
  );
});
