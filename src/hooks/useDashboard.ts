import { useState, useEffect, useCallback, useRef } from "react";
import { JiraIssue, JiraComment, GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import { fetchAssignedIssues, fetchRecentMentions } from "../services/jira";
import { fetchOpenPRs, fetchReviewRequests, fetchMentions } from "../services/github";

const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = "dev-home-dashboard-cache";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
    // Discard stale cache
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
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
  const [jiraComments, setJiraComments] = useState<JiraComment[]>(
    cachedRef.current?.jiraComments ?? [],
  );
  const [githubMentions, setGithubMentions] = useState<GitHubComment[]>(
    cachedRef.current?.githubMentions ?? [],
  );
  const [openPRs, setOpenPRs] = useState<GitHubPR[]>(cachedRef.current?.openPRs ?? []);
  const [reviewRequests, setReviewRequests] = useState<GitHubReviewRequest[]>(
    cachedRef.current?.reviewRequests ?? [],
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(() => {
    if (!active) return;

    // Cancel any in-flight requests
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    // Accumulate results to avoid repeated localStorage reads/writes
    const pendingData: Partial<Omit<DashboardCacheData, "timestamp">> = {};
    let pendingCount = 5;
    const errors: string[] = [];

    // Remove GitHub mentions that duplicate review requests for the same PR.
    // A mention with reason "review_requested" is redundant when the same PR
    // already appears in the dedicated review-requests list.
    const deduplicateMentions = () => {
      const reviews = pendingData.reviewRequests;
      const mentions = pendingData.githubMentions;
      if (!reviews || !mentions) return;

      const reviewPRKeys = new Set(reviews.map((r) => `${r.repo_full_name}#${r.number}`));
      const filtered = mentions.filter(
        (m) =>
          m.reason !== "review_requested" ||
          !reviewPRKeys.has(`${m.repo_full_name}#${m.pr_number}`),
      );
      pendingData.githubMentions = filtered;
      setGithubMentions(filtered);
    };

    const settle = (errorMsg?: string) => {
      if (controller.signal.aborted) return;
      if (errorMsg) errors.push(errorMsg);
      pendingCount -= 1;
      if (pendingCount <= 0) {
        setLoading(false);
        if (errors.length > 0) {
          setError(errors.join("; "));
        }
        // Deduplicate mentions against review requests before caching
        deduplicateMentions();
        // Save cache once with all accumulated data
        saveCache({
          jiraIssues: pendingData.jiraIssues ?? [],
          jiraComments: pendingData.jiraComments ?? [],
          githubMentions: pendingData.githubMentions ?? [],
          openPRs: pendingData.openPRs ?? [],
          reviewRequests: pendingData.reviewRequests ?? [],
        });
      }
    };

    fetchAssignedIssues()
      .then((data) => {
        if (controller.signal.aborted) return;
        setJiraIssues(data);
        pendingData.jiraIssues = data;
        settle();
      })
      .catch((err) => settle(err?.message || String(err)));

    fetchRecentMentions()
      .then((data) => {
        if (controller.signal.aborted) return;
        setJiraComments(data);
        pendingData.jiraComments = data;
        settle();
      })
      .catch((err) => settle(err?.message || String(err)));

    fetchOpenPRs()
      .then((data) => {
        if (controller.signal.aborted) return;
        setOpenPRs(data);
        pendingData.openPRs = data;
        settle();
      })
      .catch((err) => settle(err?.message || String(err)));

    fetchReviewRequests()
      .then((data) => {
        if (controller.signal.aborted) return;
        setReviewRequests(data);
        pendingData.reviewRequests = data;
        settle();
      })
      .catch((err) => settle(err?.message || String(err)));

    fetchMentions()
      .then((data) => {
        if (controller.signal.aborted) return;
        setGithubMentions(data);
        pendingData.githubMentions = data;
        settle();
      })
      .catch((err) => settle(err?.message || String(err)));
  }, [active]);

  // Fetch data when active changes to true, with visibility-based polling
  useEffect(() => {
    if (!active) return;

    fetchAll();

    // Set up polling interval
    intervalRef.current = setInterval(fetchAll, POLLING_INTERVAL_MS);

    // Pause polling when window is hidden, resume when visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        if (!intervalRef.current) {
          fetchAll();
          intervalRef.current = setInterval(fetchAll, POLLING_INTERVAL_MS);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
