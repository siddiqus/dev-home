import { useState, useEffect, useCallback, useRef } from "react";
import { JiraIssue, JiraComment, GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import { fetchAssignedIssues, fetchRecentMentions } from "../services/jira";
import { fetchOpenPRs, fetchReviewRequests, fetchMentions } from "../services/github";

const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = "dev-home-dashboard-cache";

interface DashboardCacheData {
  jiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  openPRs: GitHubPR[];
  reviewRequests: GitHubReviewRequest[];
  timestamp: number;
}

function loadCache(): DashboardCacheData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCacheData;
    // Basic validation: ensure the expected fields exist
    if (
      !Array.isArray(parsed.jiraIssues) ||
      !Array.isArray(parsed.jiraComments) ||
      !Array.isArray(parsed.githubMentions) ||
      !Array.isArray(parsed.openPRs) ||
      !Array.isArray(parsed.reviewRequests)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(data: Omit<DashboardCacheData, "timestamp">): void {
  try {
    const cacheEntry: DashboardCacheData = {
      ...data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
  } catch {
    // Silently ignore storage errors (e.g. quota exceeded)
  }
}

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
  const cachedRef = useRef(loadCache());
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>(cachedRef.current?.jiraIssues ?? []);
  const [jiraComments, setJiraComments] = useState<JiraComment[]>(cachedRef.current?.jiraComments ?? []);
  const [githubMentions, setGithubMentions] = useState<GitHubComment[]>(cachedRef.current?.githubMentions ?? []);
  const [openPRs, setOpenPRs] = useState<GitHubPR[]>(cachedRef.current?.openPRs ?? []);
  const [reviewRequests, setReviewRequests] = useState<GitHubReviewRequest[]>(cachedRef.current?.reviewRequests ?? []);
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

      // Extract fulfilled values, falling back to current state if rejected
      const newJiraIssues =
        issuesResult.status === "fulfilled" ? issuesResult.value : undefined;
      const newJiraComments =
        commentsResult.status === "fulfilled" ? commentsResult.value : undefined;
      const newOpenPRs =
        prsResult.status === "fulfilled" ? prsResult.value : undefined;
      const newReviewRequests =
        reviewsResult.status === "fulfilled" ? reviewsResult.value : undefined;
      const newGithubMentions =
        mentionsResult.status === "fulfilled" ? mentionsResult.value : undefined;

      if (newJiraIssues !== undefined) setJiraIssues(newJiraIssues);
      if (newJiraComments !== undefined) setJiraComments(newJiraComments);
      if (newOpenPRs !== undefined) setOpenPRs(newOpenPRs);
      if (newReviewRequests !== undefined) setReviewRequests(newReviewRequests);
      if (newGithubMentions !== undefined) setGithubMentions(newGithubMentions);

      // Save to cache using the latest successfully fetched data.
      // For any field that failed, preserve the previous cached value.
      const previousCache = loadCache();
      saveCache({
        jiraIssues: newJiraIssues ?? previousCache?.jiraIssues ?? [],
        jiraComments: newJiraComments ?? previousCache?.jiraComments ?? [],
        githubMentions: newGithubMentions ?? previousCache?.githubMentions ?? [],
        openPRs: newOpenPRs ?? previousCache?.openPRs ?? [],
        reviewRequests: newReviewRequests ?? previousCache?.reviewRequests ?? [],
      });

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
