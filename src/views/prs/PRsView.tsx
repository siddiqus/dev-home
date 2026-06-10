import React, { useState, useEffect, useCallback } from "react";
import { GitHubPR, JiraIssue } from "../../types";
import type { ClaudeAction } from "../../types/claude";
import { fetchRecentlyMergedPRs } from "../../services/github";
import { PRTable } from "../../components/PRTable";
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
  onClaudeAction?: (
    pr: { number: number; repo_full_name: string; title: string },
    action: ClaudeAction,
    customPrompt?: string,
  ) => void;
}

export const PRsView: React.FC<PRsViewProps> = ({
  openPRs,
  loading,
  jiraIssues,
  jiraBaseUrl,
  configured,
  refreshKey,
  claudeEnabled,
  onClaudeAction,
}) => {
  const [subTab, setSubTab] = useState<PRSubTab>(() => {
    return (localStorage.getItem("dev-home-prs-subtab") as PRSubTab) || "open";
  });

  const handleSubTab = (tab: PRSubTab) => {
    setSubTab(tab);
    localStorage.setItem("dev-home-prs-subtab", tab);
  };

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
      </div>

      {subTab === "open" && (
        <PRTable
          prs={openPRs}
          loading={loading}
          jiraIssues={jiraIssues}
          variant="my-prs"
          jiraBaseUrl={jiraBaseUrl}
          claudeEnabled={claudeEnabled}
          onClaudeAction={onClaudeAction}
        />
      )}
      {subTab === "merged" && (
        <PRTable
          prs={mergedPRs}
          loading={mergedPRsLoading}
          variant="recently-merged"
          jiraBaseUrl={jiraBaseUrl}
        />
      )}
    </div>
  );
};
