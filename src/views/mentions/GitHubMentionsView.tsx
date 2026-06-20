import React from "react";
import { GitHubComment } from "../../types";
import { GitHubMentions } from "../../components/GitHubMentions";

interface GitHubMentionsViewProps {
  githubMentions: GitHubComment[];
  loading: boolean;
}

export const GitHubMentionsView: React.FC<GitHubMentionsViewProps> = ({
  githubMentions,
  loading,
}) => {
  const sortedMentions = [...githubMentions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return <GitHubMentions mentions={sortedMentions} loading={loading} />;
};
