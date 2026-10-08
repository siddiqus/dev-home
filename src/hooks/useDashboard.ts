import { useState, useEffect, useCallback, useRef } from "react";
import { JiraIssue, JiraComment, GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import { fetchAssignedIssues, fetchIssuesByKeys, fetchRecentMentions } from "../services/jira";
import { fetchOpenPRs, fetchReviewRequests, fetchMentions } from "../services/github";
import {
  accountIdentity,
  credentialsFingerprint,
  loadSettings,
  SETTINGS_EVENT,
} from "../services/config";
import { ticketKeyOf } from "../utils/tickets";
import { DataSource, isRemoteSource } from "../config/tabData";
import { prNoteKey } from "../utils/prNotes";
import { readCached, writeCached } from "../lib/ttlCache";

const POLLING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_KEY = "dev-home-dashboard-cache";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface DashboardData {
  /** Issues assigned to the user (fetchAssignedIssues only). */
  assignedJiraIssues: JiraIssue[];
  /** Non-assigned issues referenced by PRs/reviews, fetched for enrichment. */
  extraJiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  openPRs: GitHubPR[];
  reviewRequests: GitHubReviewRequest[];
  reviewingPRs: GitHubPR[];
}

interface DashboardCacheData extends Partial<DashboardData> {
  /** Pre-split caches stored assigned ∪ extras here; read as assigned for compat. */
  jiraIssues?: JiraIssue[];
  /** accountIdentity() of the settings the cache was written under. */
  owner?: string;
  timestamp: number;
}

const EMPTY_DATA: DashboardData = {
  assignedJiraIssues: [],
  extraJiraIssues: [],
  jiraComments: [],
  githubMentions: [],
  openPRs: [],
  reviewRequests: [],
  reviewingPRs: [],
};

function loadCache(): DashboardData | null {
  // Discard stale caches and caches written for another account.
  const parsed = readCached<DashboardCacheData>(CACHE_KEY, CACHE_TTL_MS);
  if (!parsed) return null;
  if (parsed.owner !== undefined && parsed.owner !== accountIdentity(loadSettings())) {
    return null;
  }
  const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  return {
    assignedJiraIssues: list(parsed.assignedJiraIssues ?? parsed.jiraIssues),
    extraJiraIssues: list(parsed.extraJiraIssues),
    jiraComments: list(parsed.jiraComments),
    githubMentions: list(parsed.githubMentions),
    openPRs: list(parsed.openPRs),
    reviewRequests: list(parsed.reviewRequests),
    reviewingPRs: list(parsed.reviewingPRs),
  };
}

function saveCache(data: DashboardData): void {
  writeCached(CACHE_KEY, { ...data, owner: accountIdentity(loadSettings()) });
}

/** Assigned issues followed by enrichment extras not already assigned. */
function mergeIssues(assigned: JiraIssue[], extras: JiraIssue[]): JiraIssue[] {
  const seen = new Set(assigned.map((i) => i.key.toUpperCase()));
  const merged = [...assigned];
  for (const issue of extras) {
    const key = issue.key.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(issue);
  }
  return merged;
}

interface UseDashboardReturn {
  jiraIssues: JiraIssue[];
  assignedJiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  openPRs: GitHubPR[];
  reviewRequests: GitHubReviewRequest[];
  reviewingPRs: GitHubPR[];
  /** Remote sources that have completed a fetch (cache-seeded data doesn't count). */
  loadedSources: ReadonlySet<DataSource>;
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
  const initial = cachedRef.current ?? EMPTY_DATA;
  // Issues strictly assigned to the current user. Unlike jiraIssues, this is
  // never merged with PR-referenced tickets, so it stays clean for "My Tasks".
  const [assignedJiraIssues, setAssignedJiraIssues] = useState<JiraIssue[]>(
    initial.assignedJiraIssues,
  );
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>(() =>
    mergeIssues(initial.assignedJiraIssues, initial.extraJiraIssues),
  );
  const [jiraComments, setJiraComments] = useState<JiraComment[]>(initial.jiraComments);
  const [githubMentions, setGithubMentions] = useState<GitHubComment[]>(initial.githubMentions);
  const [openPRs, setOpenPRs] = useState<GitHubPR[]>(initial.openPRs);
  const [reviewRequests, setReviewRequests] = useState<GitHubReviewRequest[]>(
    initial.reviewRequests,
  );
  const [reviewingPRs, setReviewingPRs] = useState<GitHubPR[]>(initial.reviewingPRs);
  const [loadedSources, setLoadedSources] = useState<ReadonlySet<DataSource>>(() => new Set());
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
  const lastFetchedRef = useRef<Map<DataSource, number>>(new Map());
  // True while at least one requested source is in flight (drives `loading`).
  const anyInFlight = () => inFlightRef.current.size > 0;
  // Bumped when the account changes; work started under an older generation
  // (e.g. enrichment, which has no per-source controller) is discarded.
  const generationRef = useRef(0);

  // Latest per-source data, kept in refs so cross-source enrichment/dedup and
  // cache writes always see current values regardless of React batching.
  const dataRef = useRef<DashboardData>({ ...initial });
  // Enrichment keys currently being fetched, so overlapping triggers don't
  // request the same issues twice.
  const enrichingRef = useRef<Set<string>>(new Set());

  // Mentions (notifications + comments on the user's PRs), retained so the dedup
  // can re-run as review requests arrive.
  const notificationMentionsRef = useRef<GitHubComment[] | null>(null);

  // Per-source error strings, aggregated into the `error` output. A source's
  // entry is cleared on its next success so stale failures don't linger.
  const errorsRef = useRef<Map<DataSource, string>>(new Map());

  const persistCache = useCallback(() => {
    saveCache(dataRef.current);
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

  const markLoaded = useCallback((source: DataSource) => {
    lastFetchedRef.current.set(source, Date.now());
    if (loadedRef.current.has(source)) return;
    loadedRef.current.add(source);
    setLoadedSources(new Set(loadedRef.current));
  }, []);

  const publishJiraIssues = useCallback(() => {
    const { assignedJiraIssues: assigned, extraJiraIssues: extras } = dataRef.current;
    setJiraIssues(mergeIssues(assigned, extras));
  }, []);

  // Cross-source enrichment: once jiraIssues and a PR source have loaded, fetch
  // Jira tickets referenced by PRs/reviews that aren't assigned to the user.
  // They're kept apart from the assigned list so re-fetching either side never
  // duplicates or drops the other. `refetch` re-requests extras already held
  // (used when the jiraIssues source itself refreshes); otherwise only keys not
  // yet fetched are requested.
  const enrichJiraIssues = useCallback(
    (opts: { refetch?: boolean } = {}) => {
      const loaded = loadedRef.current;
      if (!loaded.has("jiraIssues")) return;
      if (!loaded.has("openPRs") && !loaded.has("reviewRequests")) return;

      const data = dataRef.current;
      const assignedKeys = new Set(data.assignedJiraIssues.map((i) => i.key.toUpperCase()));
      const referenced = new Set<string>();
      for (const pr of [...data.openPRs, ...data.reviewRequests, ...data.reviewingPRs]) {
        const key = ticketKeyOf(pr);
        if (key && !assignedKeys.has(key.toUpperCase())) referenced.add(key.toUpperCase());
      }

      // Drop extras no PR references any more (or that are now assigned).
      const kept = data.extraJiraIssues.filter((i) => referenced.has(i.key.toUpperCase()));
      if (kept.length !== data.extraJiraIssues.length) {
        data.extraJiraIssues = kept;
        publishJiraIssues();
        persistCache();
      }

      const held = new Set(kept.map((i) => i.key.toUpperCase()));
      const missing = [...referenced].filter(
        (k) => !enrichingRef.current.has(k) && (opts.refetch || !held.has(k)),
      );
      if (missing.length === 0) return;

      const generation = generationRef.current;
      for (const k of missing) enrichingRef.current.add(k);
      fetchIssuesByKeys(missing, { withDetail: false })
        .then((fetched) => {
          if (generationRef.current !== generation) return;
          const fresh = new Map(fetched.map((i) => [i.key.toUpperCase(), i]));
          dataRef.current.extraJiraIssues = [
            ...dataRef.current.extraJiraIssues.filter((i) => !fresh.has(i.key.toUpperCase())),
            ...fresh.values(),
          ];
          publishJiraIssues();
          persistCache();
        })
        .catch(() => {})
        .finally(() => {
          if (generationRef.current !== generation) return;
          for (const k of missing) enrichingRef.current.delete(k);
        });
    },
    [persistCache, publishJiraIssues],
  );

  // Drop review_requested notifications for PRs already listed as review
  // requests, and dedupe by comment ID. Runs once mentions are in; review
  // requests re-run it as they arrive.
  const deduplicateMentions = useCallback(() => {
    if (notificationMentionsRef.current === null) return;

    const reviews = dataRef.current.reviewRequests;
    const merged = notificationMentionsRef.current;
    const reviewPRKeys = new Set(reviews.map(prNoteKey));
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
      const data = await fetchAssignedIssues(signal);
      if (signal.aborted) return;
      setAssignedJiraIssues(data);
      dataRef.current.assignedJiraIssues = data;
      publishJiraIssues();
      markLoaded("jiraIssues");
      setSourceError("jiraIssues", null);
      persistCache();
      enrichJiraIssues({ refetch: true });
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
      const data = await fetchRecentMentions(signal);
      if (signal.aborted) return;
      setJiraComments(data);
      dataRef.current.jiraComments = data;
      markLoaded("jiraComments");
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
      const prs = await fetchOpenPRs(signal);
      if (signal.aborted) return;
      setOpenPRs(prs);
      dataRef.current.openPRs = prs;
      markLoaded("openPRs");
      setSourceError("openPRs", null);
      persistCache();
      enrichJiraIssues();
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
      const { reviews, reviewing } = await fetchReviewRequests(signal);
      if (signal.aborted) return;
      setReviewRequests(reviews);
      setReviewingPRs(reviewing);
      dataRef.current.reviewRequests = reviews;
      dataRef.current.reviewingPRs = reviewing;
      markLoaded("reviewRequests");
      setSourceError("reviewRequests", null);
      persistCache();
      enrichJiraIssues();
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
      const data = await fetchMentions(signal);
      if (signal.aborted) return;
      // Store raw mentions; review-request dupes are dropped in deduplicateMentions.
      notificationMentionsRef.current = data;
      markLoaded("githubMentions");
      setSourceError("githubMentions", null);
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

  // Refetch loaded sources last fetched at least `maxAgeMs` ago (0 = all of
  // them). Used by polling and manual refresh so we only re-hit services the
  // user has actually viewed.
  const refetchLoaded = useCallback(
    (maxAgeMs = 0) => {
      const now = Date.now();
      const due = [...loadedRef.current].filter(
        (s) => now - (lastFetchedRef.current.get(s) ?? 0) >= maxAgeMs,
      );
      if (due.length === 0) return;
      ensure(due, { force: true });
    },
    [ensure],
  );

  // Visibility-aware polling. No eager fetch on mount — data loads only via
  // ensure() — but once sources are loaded we keep them fresh on an interval.
  useEffect(() => {
    if (!active) return;

    const poll = () => refetchLoaded();
    intervalRef.current = setInterval(poll, POLLING_INTERVAL_MS);

    // Pause polling when the window is hidden. On return, refetch only what
    // went stale while away, so quick tab switches don't cost a full refresh.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else if (!intervalRef.current) {
        refetchLoaded(POLLING_INTERVAL_MS);
        intervalRef.current = setInterval(poll, POLLING_INTERVAL_MS);
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

  // When credentials change, everything held belongs to the old account:
  // cancel in-flight work, drop data and cache, then reload what was in use.
  // UI-only settings changes (e.g. hidden tabs) leave the data alone.
  const fingerprintRef = useRef(credentialsFingerprint(loadSettings()));
  useEffect(() => {
    const onSettingsChange = () => {
      const fingerprint = credentialsFingerprint(loadSettings());
      if (fingerprint === fingerprintRef.current) return;
      fingerprintRef.current = fingerprint;

      const wanted = [...new Set([...loadedRef.current, ...inFlightRef.current.keys()])];
      generationRef.current += 1;
      for (const controller of inFlightRef.current.values()) controller.abort();
      inFlightRef.current.clear();
      loadedRef.current.clear();
      lastFetchedRef.current.clear();
      enrichingRef.current.clear();
      errorsRef.current.clear();
      notificationMentionsRef.current = null;
      dataRef.current = { ...EMPTY_DATA };
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        // Ignore storage errors.
      }

      setLoadedSources(new Set());
      setAssignedJiraIssues([]);
      setJiraIssues([]);
      setJiraComments([]);
      setGithubMentions([]);
      setOpenPRs([]);
      setReviewRequests([]);
      setReviewingPRs([]);
      setError(null);
      setLoading(false);
      setJiraIssuesLoading(false);
      setJiraCommentsLoading(false);
      setGithubMentionsLoading(false);
      setOpenPRsLoading(false);
      setReviewRequestsLoading(false);

      ensure(wanted);
    };
    window.addEventListener(SETTINGS_EVENT, onSettingsChange);
    return () => window.removeEventListener(SETTINGS_EVENT, onSettingsChange);
  }, [ensure]);

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
    reviewingPRs,
    loadedSources,
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
