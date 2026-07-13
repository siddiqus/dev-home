import { useState, useEffect, useCallback, useRef } from "react";
import { JiraIssue, JiraComment, GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import { fetchAssignedIssues, fetchIssuesByKeys, fetchRecentMentions } from "../services/jira";
import { fetchOpenPRs, fetchReviewRequests, fetchMentions } from "../services/github";
import { extractTicketKey, sourceFromPR } from "../utils/tickets";
import { DataSource, isRemoteSource } from "../config/tabData";

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
  ensure: (sources: DataSource[], opts?: { force?: boolean }) => void;
  refresh: (sources?: DataSource[]) => void;
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

  // Keep `active` readable from stable callbacks without re-creating them.
  const activeRef = useRef(active);
  activeRef.current = active;

  // Per-source lifecycle tracking. These are refs so repeated ensure() calls on
  // every render / tab change stay idempotent and never refire in-flight work.
  const loadedRef = useRef<Set<DataSource>>(new Set());
  const inFlightRef = useRef<Map<DataSource, AbortController>>(new Map());
  // Whether any source has ever finished loading, used to drive the aggregate
  // `loading` flag (true while at least one requested source is in-flight).
  const anyInFlight = () => inFlightRef.current.size > 0;

  // Latest per-source data, kept in refs so cross-source enrichment/dedup and
  // cache writes always see current values regardless of React batching.
  const dataRef = useRef<Omit<DashboardCacheData, "timestamp">>({
    jiraIssues: cachedRef.current?.jiraIssues ?? [],
    jiraComments: cachedRef.current?.jiraComments ?? [],
    githubMentions: cachedRef.current?.githubMentions ?? [],
    openPRs: cachedRef.current?.openPRs ?? [],
    reviewRequests: cachedRef.current?.reviewRequests ?? [],
  });

  // PR comments and notification mentions arrive independently; retained here so
  // the mention dedup can merge them once all its inputs are present.
  const prCommentsRef = useRef<GitHubComment[]>([]);
  const notificationMentionsRef = useRef<GitHubComment[] | null>(null);
  // Whether we've received notification mentions since (re)loading githubMentions.
  const haveNotificationMentionsRef = useRef<boolean>(false);

  // Per-source error strings, aggregated into the `error` output. A source's
  // entry is cleared on its next success so stale failures don't linger.
  const errorsRef = useRef<Map<DataSource, string>>(new Map());

  const persistCache = useCallback(() => {
    saveCache({ ...dataRef.current });
  }, []);

  const publishError = useCallback(() => {
    const msgs = [...errorsRef.current.values()];
    setError(msgs.length > 0 ? msgs.join("; ") : null);
  }, []);

  const setSourceError = useCallback(
    (source: DataSource, message: string | null) => {
      if (message === null) {
        errorsRef.current.delete(source);
      } else {
        errorsRef.current.set(source, message);
      }
      publishError();
    },
    [publishError],
  );

  // Cross-source enrichment: when BOTH openPRs and jiraIssues are loaded, find
  // Jira ticket keys referenced by PRs/reviews that aren't already known and
  // fetch them, merging into jiraIssues (but never into assignedJiraIssues).
  const fetchMissingJiraIssues = useCallback(
    (signal: AbortSignal) => {
      if (!loadedRef.current.has("openPRs") || !loadedRef.current.has("jiraIssues")) return;
      const knownKeys = new Set(dataRef.current.jiraIssues.map((i) => i.key.toUpperCase()));
      const allPRs = [...dataRef.current.openPRs, ...dataRef.current.reviewRequests];
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
          if (signal.aborted) return;
          const merged = [...dataRef.current.jiraIssues, ...extra];
          dataRef.current.jiraIssues = merged;
          setJiraIssues(merged);
          persistCache();
        })
        .catch(() => {});
    },
    [persistCache],
  );

  // Merge PR comments + notification mentions, remove review_requested dupes
  // that correspond to actual review requests, and deduplicate by comment ID.
  // Guarded on all three inputs (reviewRequests, notification mentions, and PR
  // comments via openPRs) being present.
  const deduplicateMentions = useCallback(() => {
    if (!loadedRef.current.has("reviewRequests")) return;
    if (!loadedRef.current.has("openPRs")) return;
    if (!haveNotificationMentionsRef.current || notificationMentionsRef.current === null) return;

    const reviews = dataRef.current.reviewRequests;
    const merged = [...notificationMentionsRef.current, ...prCommentsRef.current];
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
    dataRef.current.githubMentions = filtered;
    setGithubMentions(filtered);
    persistCache();
  }, [persistCache]);

  // Individual per-source fetchers. Each owns its own AbortController, loading
  // flag, loaded/in-flight bookkeeping, error entry, and cache update. They are
  // invoked exclusively through `ensure`, which handles the skip/force gating.
  const fetchers = useRef<Record<DataSource, (signal: AbortSignal) => Promise<void>>>(
    {} as Record<DataSource, (signal: AbortSignal) => Promise<void>>,
  );

  fetchers.current.jiraIssues = async (signal) => {
    setJiraIssuesLoading(true);
    try {
      const data = await fetchAssignedIssues();
      if (signal.aborted) return;
      setJiraIssues(data);
      setAssignedJiraIssues(data);
      dataRef.current.jiraIssues = data;
      loadedRef.current.add("jiraIssues");
      setSourceError("jiraIssues", null);
      persistCache();
      // Enrich once the second of {openPRs, jiraIssues} has arrived.
      fetchMissingJiraIssues(signal);
    } catch (err) {
      if (signal.aborted) return;
      setSourceError("jiraIssues", `JIRA Issues: ${errMsg(err)}`);
    } finally {
      if (!signal.aborted) setJiraIssuesLoading(false);
    }
  };

  fetchers.current.jiraComments = async (signal) => {
    setJiraCommentsLoading(true);
    try {
      const data = await fetchRecentMentions();
      if (signal.aborted) return;
      setJiraComments(data);
      dataRef.current.jiraComments = data;
      loadedRef.current.add("jiraComments");
      setSourceError("jiraComments", null);
      persistCache();
    } catch (err) {
      if (signal.aborted) return;
      setSourceError("jiraComments", `JIRA Mentions: ${errMsg(err)}`);
    } finally {
      if (!signal.aborted) setJiraCommentsLoading(false);
    }
  };

  fetchers.current.openPRs = async (signal) => {
    setOpenPRsLoading(true);
    try {
      const { prs, prComments } = await fetchOpenPRs();
      if (signal.aborted) return;
      setOpenPRs(prs);
      dataRef.current.openPRs = prs;
      // Store PR comments; merged with notification mentions in deduplicateMentions.
      prCommentsRef.current = prComments;
      loadedRef.current.add("openPRs");
      setSourceError("openPRs", null);
      persistCache();
      // Enrich once the second of {openPRs, jiraIssues} has arrived.
      fetchMissingJiraIssues(signal);
      // PR comments are an input to the mention dedup.
      deduplicateMentions();
    } catch (err) {
      if (signal.aborted) return;
      setSourceError("openPRs", `GitHub PRs: ${errMsg(err)}`);
    } finally {
      if (!signal.aborted) setOpenPRsLoading(false);
    }
  };

  fetchers.current.reviewRequests = async (signal) => {
    setReviewRequestsLoading(true);
    try {
      const data = await fetchReviewRequests();
      if (signal.aborted) return;
      setReviewRequests(data);
      dataRef.current.reviewRequests = data;
      loadedRef.current.add("reviewRequests");
      setSourceError("reviewRequests", null);
      persistCache();
      // Review requests are an input to the mention dedup.
      deduplicateMentions();
    } catch (err) {
      if (signal.aborted) return;
      setSourceError("reviewRequests", `GitHub Reviews: ${errMsg(err)}`);
    } finally {
      if (!signal.aborted) setReviewRequestsLoading(false);
    }
  };

  fetchers.current.githubMentions = async (signal) => {
    setGithubMentionsLoading(true);
    try {
      const data = await fetchMentions();
      if (signal.aborted) return;
      // Store notification mentions; merged with PR comments in deduplicateMentions.
      notificationMentionsRef.current = data;
      haveNotificationMentionsRef.current = true;
      loadedRef.current.add("githubMentions");
      setSourceError("githubMentions", null);
      // deduplicateMentions writes githubMentions state + cache; if its other
      // inputs aren't ready yet it no-ops and the merge runs when they arrive.
      deduplicateMentions();
    } catch (err) {
      if (signal.aborted) return;
      setSourceError("githubMentions", `GitHub Mentions: ${errMsg(err)}`);
    } finally {
      if (!signal.aborted) setGithubMentionsLoading(false);
    }
  };

  // Fetch a single remote source, wiring up its abort controller and updating
  // the aggregate `loading` flag. Assumes the caller (ensure) has already
  // decided this source should run.
  const runSource = useCallback((source: DataSource) => {
    // Cancel only this source's own in-flight request; siblings are untouched.
    inFlightRef.current.get(source)?.abort();
    const controller = new AbortController();
    inFlightRef.current.set(source, controller);
    setLoading(true);

    void fetchers.current[source](controller.signal).finally(() => {
      // Only clear if this exact controller is still the current one (a newer
      // force-refetch may have replaced it).
      if (inFlightRef.current.get(source) === controller) {
        inFlightRef.current.delete(source);
      }
      if (!anyInFlight()) setLoading(false);
    });
  }, []);

  // Lazily fetch the requested remote sources on demand. Idempotent and safe to
  // call on every render / tab change: already-loaded or in-flight sources are
  // skipped unless `opts.force` is set. Local sources are silently ignored.
  const ensure = useCallback(
    (sources: DataSource[], opts?: { force?: boolean }) => {
      if (!activeRef.current) return;
      const force = opts?.force ?? false;
      for (const source of sources) {
        if (!isRemoteSource(source)) continue;
        const isLoaded = loadedRef.current.has(source);
        const isInFlight = inFlightRef.current.has(source);
        if (!force && (isLoaded || isInFlight)) continue;
        runSource(source);
      }
    },
    [runSource],
  );

  // Refetch every source that has been loaded at least once. Used by polling
  // and manual refresh so we only re-hit services the user has actually viewed.
  const refetchLoaded = useCallback(() => {
    const loaded = [...loadedRef.current];
    if (loaded.length === 0) return;
    ensure(loaded, { force: true });
  }, [ensure]);

  // Visibility-aware polling. No eager fetch on mount — data loads only via
  // ensure() — but once sources are loaded we keep them fresh on an interval.
  useEffect(() => {
    if (!active) return;

    intervalRef.current = setInterval(refetchLoaded, POLLING_INTERVAL_MS);

    // Pause polling when the window is hidden, resume (and refetch) when visible.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        if (!intervalRef.current) {
          refetchLoaded();
          intervalRef.current = setInterval(refetchLoaded, POLLING_INTERVAL_MS);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Cancel every in-flight source and drop the controllers.
      for (const controller of inFlightRef.current.values()) {
        controller.abort();
      }
      inFlightRef.current.clear();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [active, refetchLoaded]);

  // Refresh scoped to the caller's sources when provided (force-refetch just
  // those remote sources), else fall back to refetching everything loaded.
  // Always bumps refreshKey so self-fetching views (PRs, Org PRs) reload too.
  const refresh = useCallback(
    (sources?: DataSource[]) => {
      if (sources !== undefined) {
        if (sources.length > 0) ensure(sources, { force: true });
      } else {
        refetchLoaded();
      }
      setRefreshKey((k) => k + 1);
    },
    [ensure, refetchLoaded],
  );

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
    ensure,
    refresh,
    refreshKey,
  };
}

function errMsg(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return String(err);
}
