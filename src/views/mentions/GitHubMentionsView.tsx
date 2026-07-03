import React from "react";
import { GitHubComment } from "../../types";
import { GitHubMentions, GitHubMentionGroup } from "../../components/GitHubMentions";

interface GitHubMentionsViewProps {
  githubMentions: GitHubComment[];
  loading: boolean;
}

export const GitHubMentionsView: React.FC<GitHubMentionsViewProps> = ({
  githubMentions,
  loading,
}) => {
  // Group mentions from the same author + reason on the same PR into one card,
  // keeping every comment so they can all be shown together in the card.
  const groups = new Map<string, GitHubMentionGroup>();
  for (const m of githubMentions) {
    const key = `${m.user.login}|${m.reason}|${m.repo_full_name}|${m.pr_number}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { key, comments: [m] });
    } else {
      existing.comments.push(m);
    }
  }

  // Sort comments within each group (newest first), then sort groups by their
  // latest comment.
  const sortedGroups = [...groups.values()]
    .map((g) => ({
      ...g,
      comments: [...g.comments].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    }))
    .sort(
      (a, b) =>
        new Date(b.comments[0].created_at).getTime() - new Date(a.comments[0].created_at).getTime(),
    );

  return <GitHubMentions groups={sortedGroups} loading={loading} />;
};
