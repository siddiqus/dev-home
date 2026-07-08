import { useState, useEffect, useCallback, useRef } from "react";
import { JiraIssue, JiraComment, GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import { fetchAssignedIssues, fetchIssuesByKeys, fetchRecentMentions } from "../services/jira";
import { fetchOpenPRs, fetchReviewRequests, fetchMentions } from "../services/github";
import { extractTicketKey, sourceFromPR } from "../utils/tickets";

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
  assignedJiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  openPRs: GitHubPR[];
  reviewRequests: GitHubReviewRequest[];
  loading: boolean;
  jiraIssuesLoading: boolean;
  jiraCommentsLoading: boolean;
  githubMentionsLoading: boolean;
  openPRsLoading: boolean;
  reviewRequestsLoading: boolean;
  error: string | null;
  refresh: () => void;
  refreshKey: number;
}

export function useDashboard(active: boolean): UseDashboardReturn {
  const cachedRef = useRef(loadCache());
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>(cachedRef.current?.jiraIssues ?? []);
  // Issues strictly assigned to the current user (from fetchAssignedIssues only).
  // Unlike jiraIssues, this is never merged with PR-referenced tickets, so it
  // stays clean for the "My Tasks" view.
  const [assignedJiraIssues, setAssignedJiraIssues] = useState<JiraIssue[]>(
    cachedRef.current?.jiraIssues ?? [],
  );
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
  const [jiraIssuesLoading, setJiraIssuesLoading] = useState<boolean>(false);
  const [jiraCommentsLoading, setJiraCommentsLoading] = useState<boolean>(false);
  const [githubMentionsLoading, setGithubMentionsLoading] = useState<boolean>(false);
  const [openPRsLoading, setOpenPRsLoading] = useState<boolean>(false);
  const [reviewRequestsLoading, setReviewRequestsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(() => {
    if (!active) return;

    // Cancel any in-flight requests
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setJiraIssuesLoading(true);
    setJiraCommentsLoading(true);
    setGithubMentionsLoading(true);
    setOpenPRsLoading(true);
    setReviewRequestsLoading(true);
    setError(null);

    // Accumulate results to avoid repeated localStorage reads/writes
    const pendingData: Partial<Omit<DashboardCacheData, "timestamp">> = {};
    let pendingCount = 5;
    const errors: string[] = [];

    const fetchMissingJiraIssues = () => {
      if (!pendingData.openPRs || !pendingData.jiraIssues) return;
      const knownKeys = new Set(pendingData.jiraIssues.map((i) => i.key.toUpperCase()));
      const allPRs = [...pendingData.openPRs, ...(pendingData.reviewRequests ?? [])];
      const missingKeys = [
        ...new Set(
          allPRs
            .map((pr) => extractTicketKey(sourceFromPR(pr)))
            .filter((k): k is string => k !== null && !knownKeys.has(k.toUpperCase())),
        ),
      ];
      if (missingKeys.length === 0) return;
      fetchIssuesByKeys(missingKeys)
        .then((extra) => {
          if (controller.signal.aborted) return;
          const merged = [...pendingData.jiraIssues!, ...extra];
          pendingData.jiraIssues = merged;
          setJiraIssues(merged);
        })
        .catch(() => {});
    };

    // PR comments and notification mentions arrive independently; accumulated here
    // and merged at settle time to avoid race-condition overwrites.
    let pendingPRComments: GitHubComment[] = [];
    let pendingNotificationMentions: GitHubComment[] | null = null;

    // Merge PR comments + notification mentions, remove review_requested dupes,
    // and deduplicate by comment ID.
    const deduplicateMentions = () => {
      const reviews = pendingData.reviewRequests;
      if (!reviews || pendingNotificationMentions === null) return;

      const merged = [...pendingNotificationMentions, ...pendingPRComments];
      const reviewPRKeys = new Set(reviews.map((r) => `${r.repo_full_name}#${r.number}`));
      const seen = new Set<number | string>();
      const filtered = merged.filter((m) => {
        if (
          m.reason === "review_requested" &&
          reviewPRKeys.has(`${m.repo_full_name}#${m.pr_number}`)
        ) {
          return false;
        }
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
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
        setAssignedJiraIssues(data);
        pendingData.jiraIssues = data;
        setJiraIssuesLoading(false);
        fetchMissingJiraIssues();
        settle();
      })
      .catch((err) => {
        setJiraIssuesLoading(false);
        settle(`JIRA Issues: ${err?.message || String(err)}`);
      });

    fetchRecentMentions()
      .then((data) => {
        if (controller.signal.aborted) return;
        setJiraComments(data);
        pendingData.jiraComments = data;
        setJiraCommentsLoading(false);
        settle();
      })
      .catch((err) => {
        setJiraCommentsLoading(false);
        settle(`JIRA Mentions: ${err?.message || String(err)}`);
      });

    fetchOpenPRs()
      .then(({ prs, prComments }) => {
        if (controller.signal.aborted) return;
        setOpenPRs(prs);
        pendingData.openPRs = prs;
        // Store PR comments; they'll be merged with notification mentions at settle time
        pendingPRComments = prComments;
        setOpenPRsLoading(false);
        fetchMissingJiraIssues();
        settle();
      })
      .catch((err) => {
        setOpenPRsLoading(false);
        settle(`GitHub PRs: ${err?.message || String(err)}`);
      });

    fetchReviewRequests()
      .then((data) => {
        if (controller.signal.aborted) return;
        setReviewRequests(data);
        pendingData.reviewRequests = data;
        setReviewRequestsLoading(false);
        settle();
      })
      .catch((err) => {
        setReviewRequestsLoading(false);
        settle(`GitHub Reviews: ${err?.message || String(err)}`);
      });

    fetchMentions()
      .then((data) => {
        if (controller.signal.aborted) return;
        // Store notification mentions; they'll be merged with PR comments at settle time
        pendingNotificationMentions = data;
        setGithubMentionsLoading(false);
        settle();
      })
      .catch((err) => {
        setGithubMentionsLoading(false);
        settle(`GitHub Mentions: ${err?.message || String(err)}`);
      });
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
    setRefreshKey((k) => k + 1);
  }, [fetchAll]);

  return {
    jiraIssues,
    assignedJiraIssues,
    jiraComments,
    githubMentions,
    openPRs,
    reviewRequests,
    loading,
    jiraIssuesLoading,
    jiraCommentsLoading,
    githubMentionsLoading,
    openPRsLoading,
    reviewRequestsLoading,
    error,
    refresh,
    refreshKey,
  };
}
