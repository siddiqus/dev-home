import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { IconFold, IconFoldDown, IconList, IconLayoutRows } from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../../types";
import type { ClaudeAction, ClaudeSession } from "../../types/claude";
import { fetchRecentlyMergedPRs } from "../../services/github";
import { extractTicketKey, sourceFromPR } from "../../utils/tickets";
import { PRTable, PRTableHandle } from "../../components/PRTable";
import { PRSections, PRSectionsHandle } from "../../components/PRSections";
import { SearchInput } from "../../components/SearchInput";
import { MultiSelectDropdown } from "../../components/MultiSelectDropdown";
import { DropdownItem } from "../../components/SearchableDropdown";
import "./PRsView.css";

type PRSubTab = "open" | "merged";
type PRViewMode = "segments" | "flat";

interface PRsViewProps {
  openPRs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
  jiraBaseUrl?: string;
  configured: boolean;
  refreshKey?: number;
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
}

export const PRsView: React.FC<PRsViewProps> = ({
  openPRs,
  loading,
  jiraIssues,
  jiraBaseUrl,
  configured,
  refreshKey,
  claudeEnabled,
  claudeSessions,
  onClaudeAction,
  onViewClaudeSession,
}) => {
  const [subTab, setSubTab] = useState<PRSubTab>(() => {
    return (localStorage.getItem("dev-home-prs-subtab") as PRSubTab) || "open";
  });

  const handleSubTab = (tab: PRSubTab) => {
    setSubTab(tab);
    localStorage.setItem("dev-home-prs-subtab", tab);
  };

  // Open-PRs body layout: "segments" groups PRs into action buckets (Ready /
  // Needs action / …); "flat" is a single Jira-clustered list.
  const [viewMode, setViewMode] = useState<PRViewMode>(() => {
    return (localStorage.getItem("dev-home-prs-view-mode") as PRViewMode) || "segments";
  });

  const handleViewMode = (mode: PRViewMode) => {
    setViewMode(mode);
    localStorage.setItem("dev-home-prs-view-mode", mode);
  };

  const prSectionsRef = useRef<PRSectionsHandle>(null);
  const prTableRef = useRef<PRTableHandle>(null);
  const mergedTableRef = useRef<PRTableHandle>(null);
  const [groupState, setGroupState] = useState({ hasGroups: false, allCollapsed: false });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);

  const [mergedPRs, setMergedPRs] = useState<GitHubPR[]>([]);
  const [mergedPRsLoading, setMergedPRsLoading] = useState(false);

  // Repo filter options derived from loaded PRs (union of open + merged) so the
  // dropdown stays stable when switching sub-tabs. Label is the short repo name.
  const repoItems = useMemo<DropdownItem[]>(() => {
    const names = new Set<string>();
    for (const pr of openPRs) names.add(pr.repo_full_name);
    for (const pr of mergedPRs) names.add(pr.repo_full_name);
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((full) => ({ value: full, label: full.split("/").pop() || full }));
  }, [openPRs, mergedPRs]);

  const loadMergedPRs = useCallback(async () => {
    if (!configured) return;
    setMergedPRsLoading(true);
    try {
      setMergedPRs(await fetchRecentlyMergedPRs("user"));
    } catch (err) {
      console.error("Failed to fetch recently merged PRs:", err);
    } finally {
      setMergedPRsLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    loadMergedPRs();
  }, [loadMergedPRs, refreshKey]);

  const filterPRs = useCallback(
    (prs: GitHubPR[]) => {
      const q = searchQuery.trim().toLowerCase();
      const repoSet = selectedRepos.length > 0 ? new Set(selectedRepos) : null;
      if (!q && !repoSet) return prs;
      return prs.filter((pr) => {
        if (repoSet && !repoSet.has(pr.repo_full_name)) return false;
        if (!q) return true;
        if (pr.title.toLowerCase().includes(q)) return true;
        const ticket = extractTicketKey(sourceFromPR(pr));
        if (ticket && ticket.toLowerCase().includes(q)) return true;
        const ticketTitle = ticket
          ? jiraIssues?.find((i) => i.key.toUpperCase() === ticket.toUpperCase())?.summary
          : undefined;
        if (ticketTitle && ticketTitle.toLowerCase().includes(q)) return true;
        return false;
      });
    },
    [searchQuery, selectedRepos, jiraIssues],
  );

  const filteredOpenPRs = useMemo(() => filterPRs(openPRs), [filterPRs, openPRs]);
  const filteredMergedPRs = useMemo(() => filterPRs(mergedPRs), [filterPRs, mergedPRs]);

  return (
    <div className="prs-view">
      <div className="prs-subtab-bar">
        <div className="prs-subtab-group">
          <button
            className={`prs-subtab${subTab === "open" ? " active" : ""}`}
            onClick={() => handleSubTab("open")}
          >
            Open PRs{(openPRs.length > 0 || !loading) && ` (${filteredOpenPRs.length})`}
          </button>
          <button
            className={`prs-subtab${subTab === "merged" ? " active" : ""}`}
            onClick={() => handleSubTab("merged")}
          >
            Recently Merged{(mergedPRs.length > 0 || !mergedPRsLoading) && ` (${mergedPRs.length})`}
          </button>
        </div>
        <div className="prs-subtab-bar-right">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search PRs..."
            expandOnFocus
          />
          <MultiSelectDropdown
            items={repoItems}
            values={selectedRepos}
            onChange={setSelectedRepos}
            placeholder="Filter repos..."
            allLabel="All repos"
            width={200}
          />
          {subTab === "open" && (
            <div className="prs-view-actions">
              {groupState.hasGroups && (
                <button
                  type="button"
                  className="pr-table-collapse-btn"
                  onClick={() =>
                    (viewMode === "flat" ? prTableRef : prSectionsRef).current?.toggleCollapseAll()
                  }
                  title={groupState.allCollapsed ? "Expand all groups" : "Collapse all groups"}
                >
                  {groupState.allCollapsed ? <IconFoldDown size={14} /> : <IconFold size={14} />}
                  {groupState.allCollapsed ? "Expand all" : "Collapse all"}
                </button>
              )}
              <button
                type="button"
                className="prs-view-toggle-btn"
                onClick={() => handleViewMode(viewMode === "segments" ? "flat" : "segments")}
                title={
                  viewMode === "segments" ? "Switch to flat list" : "Switch to action segments"
                }
                aria-label={
                  viewMode === "segments" ? "Switch to flat list" : "Switch to action segments"
                }
              >
                {viewMode === "segments" ? (
                  <IconList size={16} stroke={1.8} />
                ) : (
                  <IconLayoutRows size={16} stroke={1.8} />
                )}
              </button>
            </div>
          )}
          {subTab === "merged" && groupState.hasGroups && (
            <div className="prs-view-actions">
              <button
                type="button"
                className="pr-table-collapse-btn"
                onClick={() => mergedTableRef.current?.toggleCollapseAll()}
                title={groupState.allCollapsed ? "Expand all groups" : "Collapse all groups"}
              >
                {groupState.allCollapsed ? <IconFoldDown size={14} /> : <IconFold size={14} />}
                {groupState.allCollapsed ? "Expand all" : "Collapse all"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="prs-scroll-body">
        {subTab === "open" && viewMode === "segments" && (
          <PRSections
            ref={prSectionsRef}
            prs={filteredOpenPRs}
            loading={loading}
            jiraIssues={jiraIssues}
            jiraBaseUrl={jiraBaseUrl}
            claudeEnabled={claudeEnabled}
            claudeSessions={claudeSessions}
            onClaudeAction={onClaudeAction}
            onViewClaudeSession={onViewClaudeSession}
            onCollapseStateChange={(hasGroups, allCollapsed) =>
              setGroupState({ hasGroups, allCollapsed })
            }
          />
        )}
        {subTab === "open" && viewMode === "flat" && (
          <PRTable
            ref={prTableRef}
            prs={filteredOpenPRs}
            loading={loading}
            variant="my-prs"
            jiraIssues={jiraIssues}
            jiraBaseUrl={jiraBaseUrl}
            claudeEnabled={claudeEnabled}
            claudeSessions={claudeSessions}
            onClaudeAction={onClaudeAction}
            onViewClaudeSession={onViewClaudeSession}
            showGroupToolbar={false}
            reasonChips
            onCollapseStateChange={(hasGroups, allCollapsed) =>
              setGroupState({ hasGroups, allCollapsed })
            }
          />
        )}
        {subTab === "merged" && (
          <PRTable
            ref={mergedTableRef}
            prs={filteredMergedPRs}
            loading={mergedPRsLoading}
            variant="recently-merged"
            jiraBaseUrl={jiraBaseUrl}
            onCollapseStateChange={(hasGroups, allCollapsed) =>
              setGroupState({ hasGroups, allCollapsed })
            }
          />
        )}
      </div>
    </div>
  );
};
