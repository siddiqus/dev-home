import React, { useState } from "react";
import { JiraIssue } from "../../types";
import { JiraTasks } from "../../components/JiraTasks";
import { JiraIssueSearch } from "../../components/JiraIssueSearch";
import "./JiraTasksView.css";

type JiraSubTab = "my-tasks" | "search";

interface JiraTasksViewProps {
  issues: JiraIssue[];
  loading: boolean;
  baseUrl?: string;
}

export const JiraTasksView: React.FC<JiraTasksViewProps> = ({ issues, loading, baseUrl }) => {
  const [subTab, setSubTab] = useState<JiraSubTab>(() => {
    return (localStorage.getItem("dev-home-jira-subtab") as JiraSubTab) || "my-tasks";
  });

  const handleSubTab = (tab: JiraSubTab) => {
    setSubTab(tab);
    localStorage.setItem("dev-home-jira-subtab", tab);
  };

  return (
    <div className="jira-tasks-view">
      <div className="jira-subtab-bar">
        <div className="jira-subtab-group">
          <button
            className={`jira-subtab${subTab === "my-tasks" ? " active" : ""}`}
            onClick={() => handleSubTab("my-tasks")}
          >
            My Tasks
          </button>
          <button
            className={`jira-subtab${subTab === "search" ? " active" : ""}`}
            onClick={() => handleSubTab("search")}
          >
            Issue Search
          </button>
        </div>
      </div>

      {subTab === "my-tasks" && <JiraTasks issues={issues} loading={loading} baseUrl={baseUrl} />}
      {subTab === "search" && <JiraIssueSearch baseUrl={baseUrl} />}
    </div>
  );
};
