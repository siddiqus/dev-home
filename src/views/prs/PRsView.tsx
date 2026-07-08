import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { IconFold, IconFoldDown } from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../../types";
import type { ClaudeAction, ClaudeSession } from "../../types/claude";
import { fetchRecentlyMergedPRs } from "../../services/github";
import { extractTicket } from "../../utils/tickets";
import { PRTable, PRTableHandle } from "../../components/PRTable";
import { SearchInput } from "../../components/SearchInput";
import "./PRsView.css";

type PRSubTab = "open" | "merged";

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

  const prTableRef = useRef<PRTableHandle>(null);
  const [groupState, setGroupState] = useState({ hasGroups: false, allCollapsed: false });

  const [searchQuery, setSearchQuery] = useState("");

  const [mergedPRs, setMergedPRs] = useState<GitHubPR[]>([]);
  const [mergedPRsLoading, setMergedPRsLoading] = useState(false);

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
      if (!q) return prs;
      return prs.filter((pr) => {
        if (pr.title.toLowerCase().includes(q)) return true;
        const ticket = extractTicket(pr.title);
        if (ticket && ticket.toLowerCase().includes(q)) return true;
        const ticketTitle = ticket
          ? jiraIssues?.find((i) => i.key.toUpperCase() === ticket.toUpperCase())?.summary
          : undefined;
        if (ticketTitle && ticketTitle.toLowerCase().includes(q)) return true;
        return false;
      });
    },
    [searchQuery, jiraIssues],
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
            Open PRs{!loading && ` (${openPRs.length})`}
          </button>
          <button
            className={`prs-subtab${subTab === "merged" ? " active" : ""}`}
            onClick={() => handleSubTab("merged")}
          >
            Recently Merged{!mergedPRsLoading && ` (${mergedPRs.length})`}
          </button>
        </div>
        <div className="prs-subtab-bar-right">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search PRs..."
            expandOnFocus
          />
          {subTab === "open" && groupState.hasGroups && (
            <button
              type="button"
              className="pr-table-collapse-btn"
              onClick={() => prTableRef.current?.toggleCollapseAll()}
              title={groupState.allCollapsed ? "Expand all groups" : "Collapse all groups"}
            >
              {groupState.allCollapsed ? <IconFoldDown size={14} /> : <IconFold size={14} />}
              {groupState.allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
        </div>
      </div>

      {subTab === "open" && (
        <PRTable
          ref={prTableRef}
          prs={filteredOpenPRs}
          loading={loading}
          jiraIssues={jiraIssues}
          variant="my-prs"
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
      {subTab === "merged" && (
        <PRTable
          prs={filteredMergedPRs}
          loading={mergedPRsLoading}
          variant="recently-merged"
          jiraBaseUrl={jiraBaseUrl}
        />
      )}
    </div>
  );
};
