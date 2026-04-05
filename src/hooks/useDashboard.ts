import { useState, useEffect, useCallback, useRef } from "react";
import { JiraIssue, JiraComment, GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import { fetchAssignedIssues, fetchRecentMentions } from "../services/jira";
import { fetchOpenPRs, fetchReviewRequests, fetchMentions } from "../services/github";

const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface UseDashboardReturn {
  jiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  openPRs: GitHubPR[];
  reviewRequests: GitHubReviewRequest[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDashboard(active: boolean): UseDashboardReturn {
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([]);
  const [jiraComments, setJiraComments] = useState<JiraComment[]>([]);
  const [githubMentions, setGithubMentions] = useState<GitHubComment[]>([]);
  const [openPRs, setOpenPRs] = useState<GitHubPR[]>([]);
  const [reviewRequests, setReviewRequests] = useState<GitHubReviewRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!active) return;

    setLoading(true);
    setError(null);

    try {
      const results = await Promise.allSettled([
        fetchAssignedIssues(),
        fetchRecentMentions(),
        fetchOpenPRs(),
        fetchReviewRequests(),
        fetchMentions(),
      ]);

      const [issuesResult, commentsResult, prsResult, reviewsResult, mentionsResult] = results;

      if (issuesResult.status === "fulfilled") {
        setJiraIssues(issuesResult.value);
      }
      if (commentsResult.status === "fulfilled") {
        setJiraComments(commentsResult.value);
      }
      if (prsResult.status === "fulfilled") {
        setOpenPRs(prsResult.value);
      }
      if (reviewsResult.status === "fulfilled") {
        setReviewRequests(reviewsResult.value);
      }
      if (mentionsResult.status === "fulfilled") {
        setGithubMentions(mentionsResult.value);
      }

      // Collect errors from rejected promises
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => r.reason?.message || String(r.reason));

      if (errors.length > 0) {
        setError(errors.join("; "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, [active]);

  // Fetch data when active changes to true
  useEffect(() => {
    if (!active) return;

    fetchAll();

    // Set up polling interval
    intervalRef.current = setInterval(fetchAll, POLLING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, fetchAll]);

  const refresh = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    jiraIssues,
    jiraComments,
    githubMentions,
    openPRs,
    reviewRequests,
    loading,
    error,
    refresh,
  };
}
