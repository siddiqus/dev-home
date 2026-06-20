import React from "react";
import { JiraComment } from "../../types";
import { JiraComments } from "../../components/JiraComments";

interface JiraMentionsViewProps {
  jiraComments: JiraComment[];
  loading: boolean;
  jiraBaseUrl: string;
}

export const JiraMentionsView: React.FC<JiraMentionsViewProps> = ({
  jiraComments,
  loading,
  jiraBaseUrl,
}) => {
  const sortedComments = [...jiraComments].sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
  );

  return <JiraComments comments={sortedComments} loading={loading} baseUrl={jiraBaseUrl} />;
};
