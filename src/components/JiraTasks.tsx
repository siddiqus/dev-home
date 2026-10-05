import React from "react";
import Spinner from "react-bootstrap/Spinner";
import { IconChecklist } from "@tabler/icons-react";
import { JiraIssue } from "../types";
import { EmptyState } from "./EmptyState";
import { JiraIssueTable } from "./JiraIssueTable";

interface JiraTasksProps {
  issues: JiraIssue[];
  loading: boolean;
  baseUrl?: string;
}

// Issues arrive newest-updated first (the JQL orders by updated DESC).
export const JiraTasks: React.FC<JiraTasksProps> = ({ issues, loading, baseUrl }) => {
  if (loading && issues.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <EmptyState
        icon={<IconChecklist size={40} stroke={1.5} />}
        title="No assigned issues"
        description="You have no JIRA issues currently assigned to you. Enjoy the calm."
      />
    );
  }

  return <JiraIssueTable issues={issues} baseUrl={baseUrl} />;
};
