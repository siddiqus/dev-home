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

  const pendingRef = useRef(0);
  const errorsRef = useRef<string[]>([]);

  const fetchAll = useCallback(() => {
    if (!active) return;

    setLoading(true);
    setError(null);
    errorsRef.current = [];

    const settle = (errorMsg?: string) => {
      if (errorMsg) errorsRef.current.push(errorMsg);
      pendingRef.current -= 1;
      if (pendingRef.current <= 0) {
        pendingRef.current = 0;
        setLoading(false);
        if (errorsRef.current.length > 0) {
          setError(errorsRef.current.join("; "));
        }
        // Save cache once all fetches have settled
        const prev = loadCache();
        saveCache({
          jiraIssues: prev?.jiraIssues ?? [],
          jiraComments: prev?.jiraComments ?? [],
          githubMentions: prev?.githubMentions ?? [],
          openPRs: prev?.openPRs ?? [],
          reviewRequests: prev?.reviewRequests ?? [],
        });
      }
    };

    const updateCache = (field: keyof Omit<DashboardCacheData, "timestamp">, value: any) => {
      const prev = loadCache();
      saveCache({ ...prev, jiraIssues: prev?.jiraIssues ?? [], jiraComments: prev?.jiraComments ?? [], githubMentions: prev?.githubMentions ?? [], openPRs: prev?.openPRs ?? [], reviewRequests: prev?.reviewRequests ?? [], [field]: value });
    };

    pendingRef.current = 5;

    fetchAssignedIssues()
      .then((data) => { setJiraIssues(data); updateCache("jiraIssues", data); settle(); })
      .catch((err) => settle(err?.message || String(err)));

    fetchRecentMentions()
      .then((data) => { setJiraComments(data); updateCache("jiraComments", data); settle(); })
      .catch((err) => settle(err?.message || String(err)));

    fetchOpenPRs()
      .then((data) => { setOpenPRs(data); updateCache("openPRs", data); settle(); })
      .catch((err) => settle(err?.message || String(err)));

    fetchReviewRequests()
      .then((data) => { setReviewRequests(data); updateCache("reviewRequests", data); settle(); })
      .catch((err) => settle(err?.message || String(err)));

    fetchMentions()
      .then((data) => { setGithubMentions(data); updateCache("githubMentions", data); settle(); })
      .catch((err) => settle(err?.message || String(err)));
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
