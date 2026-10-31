import { useState, useEffect, useCallback, useRef } from "react";
import { GitHubPR } from "../../types";
import {
  fetchOrgPRs,
  fetchOrgPRsMulti,
  fetchOrgMembers,
  fetchOrgRepos,
  fetchRecentlyMergedPRs,
  OrgMember,
  OrgRepo,
} from "../../services/github";
import { readCached, writeCached } from "../../lib/ttlCache";

// --- localStorage caching ---

const MEMBERS_CACHE_KEY = "dev-home-org-members-cache";
const REPOS_CACHE_KEY = "dev-home-org-repos-cache";
const PRS_CACHE_KEY = "dev-home-org-prs-cache-v2";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function loadCache<T>(key: string): T | null {
  return readCached<{ data: T }>(key, CACHE_TTL_MS)?.data ?? null;
}

function saveCache<T>(key: string, data: T): void {
  writeCached(key, { data });
}

interface PRsCacheData {
  prs: GitHubPR[];
  hasNextPage: boolean;
  endCursor: string | null;
  authors: string[];
  repos: string[];
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/**
 * The org PR search behind All PRs (desktop) and PR search (phone): the org's
 * members and repos to pick from, the picked authors and repos, their open PRs
 * (one author or repo pages; several are one unpaginated search) and recently
 * merged PRs, cached in localStorage. A `refreshKey` change reloads both lists.
 */
export function useOrgPRSearch({
  configured,
  refreshKey,
}: {
  configured: boolean;
  refreshKey?: number;
}) {
  const cachedPRs = useRef(loadCache<PRsCacheData>(PRS_CACHE_KEY));
  const cachedMembers = useRef(loadCache<OrgMember[]>(MEMBERS_CACHE_KEY));
  const cachedRepos = useRef(loadCache<OrgRepo[]>(REPOS_CACHE_KEY));

  const [prs, setPrs] = useState<GitHubPR[]>(cachedPRs.current?.prs ?? []);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(cachedPRs.current?.hasNextPage ?? false);
  const [endCursor, setEndCursor] = useState<string | null>(cachedPRs.current?.endCursor ?? null);
  const [authors, setAuthors] = useState<string[]>(cachedPRs.current?.authors ?? []);
  const [selectedRepos, setSelectedRepos] = useState<string[]>(cachedPRs.current?.repos ?? []);
  const [members, setMembers] = useState<OrgMember[]>(cachedMembers.current ?? []);
  const [orgRepos, setOrgRepos] = useState<OrgRepo[]>(cachedRepos.current ?? []);

  // Open or merged, remembered across visits.
  const [subTab, setSubTabState] = useState<"open" | "merged">(() => {
    return (localStorage.getItem("dev-home-org-prs-subtab") as "open" | "merged") || "open";
  });
  const setSubTab = useCallback((tab: "open" | "merged") => {
    setSubTabState(tab);
    localStorage.setItem("dev-home-org-prs-subtab", tab);
  }, []);

  // Recently merged PRs
  const [mergedPRs, setMergedPRs] = useState<GitHubPR[]>([]);
  const [mergedPRsLoading, setMergedPRsLoading] = useState(false);
  const mergedRequestRef = useRef(0);
  const loadMergedPRs = useCallback(
    async (force = false) => {
      if (!configured) return;
      const requestId = ++mergedRequestRef.current;
      if (authors.length === 0 && selectedRepos.length === 0) {
        setMergedPRs([]);
        return;
      }
      setMergedPRsLoading(true);
      try {
        const data = await fetchRecentlyMergedPRs("org", authors, selectedRepos, { force });
        if (requestId === mergedRequestRef.current) setMergedPRs(data);
      } catch (err) {
        console.error("Failed to fetch recently merged PRs:", err);
      } finally {
        if (requestId === mergedRequestRef.current) setMergedPRsLoading(false);
      }
    },
    [configured, authors, selectedRepos],
  );
  useEffect(() => {
    loadMergedPRs();
  }, [loadMergedPRs]);

  // Load org members
  const loadMembers = useCallback(
    async (skipCache = false) => {
      if (!configured) return;
      if (!skipCache && members.length > 0) return;
      try {
        const data = await fetchOrgMembers({ force: skipCache });
        setMembers(data);
        saveCache(MEMBERS_CACHE_KEY, data);
      } catch (err) {
        console.error("Failed to fetch org members:", err);
      }
    },
    [configured, members.length],
  );

  // Load org repos
  const loadRepos = useCallback(
    async (skipCache = false) => {
      if (!configured) return;
      if (!skipCache && orgRepos.length > 0) return;
      try {
        const data = await fetchOrgRepos({ force: skipCache });
        setOrgRepos(data);
        saveCache(REPOS_CACHE_KEY, data);
      } catch (err) {
        console.error("Failed to fetch org repos:", err);
      }
    },
    [configured, orgRepos.length],
  );

  useEffect(() => {
    loadMembers();
    loadRepos();
  }, [loadMembers, loadRepos]);

  // Stabilize array dependencies for useCallback
  const authorsKey = JSON.stringify(authors);
  const reposKey = JSON.stringify(selectedRepos);

  // Whether we're in multi-filter mode (multiple authors or repos selected).
  // Multi mode is one unpaginated search, so cursor pagination is unavailable.
  const isMultiMode = authors.length > 1 || selectedRepos.length > 1;

  // Latest PR list for load-more, and a request id so a slow response for old
  // filters can't overwrite results for newer ones.
  const prsRef = useRef(prs);
  prsRef.current = prs;
  const prsRequestRef = useRef(0);

  // Fetch first page when filters change
  const fetchFirstPage = useCallback(
    async (skipCache = false) => {
      if (!configured) return;
      const requestId = ++prsRequestRef.current;
      if (authors.length === 0 && selectedRepos.length === 0) {
        setPrs([]);
        setHasNextPage(false);
        setEndCursor(null);
        return;
      }

      if (
        !skipCache &&
        cachedPRs.current &&
        arraysEqual(cachedPRs.current.authors, authors) &&
        arraysEqual(cachedPRs.current.repos, selectedRepos)
      ) {
        cachedPRs.current = null;
        return;
      }

      setLoading(true);
      setLoadingMore(false);
      try {
        if (isMultiMode) {
          // One search ORs every selected author and repo
          const merged = await fetchOrgPRsMulti(authors, selectedRepos);
          if (requestId !== prsRequestRef.current) return;
          setPrs(merged);
          setHasNextPage(false);
          setEndCursor(null);
          saveCache(PRS_CACHE_KEY, {
            prs: merged,
            hasNextPage: false,
            endCursor: null,
            authors,
            repos: selectedRepos,
          });
        } else {
          // Single author / single repo -- use the paginated endpoint directly
          const author = authors[0] || undefined;
          const repo = selectedRepos[0] || undefined;
          const result = await fetchOrgPRs(undefined, author, repo);
          if (requestId !== prsRequestRef.current) return;
          setPrs(result.prs);
          setHasNextPage(result.pageInfo.hasNextPage);
          setEndCursor(result.pageInfo.endCursor);
          saveCache(PRS_CACHE_KEY, {
            prs: result.prs,
            hasNextPage: result.pageInfo.hasNextPage,
            endCursor: result.pageInfo.endCursor,
            authors,
            repos: selectedRepos,
          });
        }
      } catch (err) {
        console.error("Failed to fetch org PRs:", err);
      } finally {
        if (requestId === prsRequestRef.current) setLoading(false);
      }
    },

    [configured, authorsKey, reposKey, isMultiMode],
  );

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  // Fetch next page (only available in single-filter mode)
  const fetchNextPage = useCallback(async () => {
    if (!hasNextPage || !endCursor || loadingMore || isMultiMode) return;
    const requestId = prsRequestRef.current;
    setLoadingMore(true);
    try {
      const author = authors[0] || undefined;
      const repo = selectedRepos[0] || undefined;
      const result = await fetchOrgPRs(endCursor, author, repo);
      // Filters changed (or a refresh started) while this page was loading.
      if (requestId !== prsRequestRef.current) return;
      const merged = [...prsRef.current, ...result.prs];
      setPrs(merged);
      setHasNextPage(result.pageInfo.hasNextPage);
      setEndCursor(result.pageInfo.endCursor);
      saveCache(PRS_CACHE_KEY, {
        prs: merged,
        hasNextPage: result.pageInfo.hasNextPage,
        endCursor: result.pageInfo.endCursor,
        authors,
        repos: selectedRepos,
      });
    } catch (err) {
      console.error("Failed to fetch more org PRs:", err);
    } finally {
      if (requestId === prsRequestRef.current) setLoadingMore(false);
    }
  }, [hasNextPage, endCursor, authors, selectedRepos, loadingMore, isMultiMode]);

  // Refresh handlers
  const refreshPRs = useCallback(() => {
    cachedPRs.current = null;
    localStorage.removeItem(PRS_CACHE_KEY);
    fetchFirstPage(true);
  }, [fetchFirstPage]);

  const refreshMembers = useCallback(() => {
    localStorage.removeItem(MEMBERS_CACHE_KEY);
    loadMembers(true);
  }, [loadMembers]);

  const refreshRepos = useCallback(() => {
    localStorage.removeItem(REPOS_CACHE_KEY);
    loadRepos(true);
  }, [loadRepos]);

  const refreshAll = useCallback(() => {
    cachedPRs.current = null;
    localStorage.removeItem(PRS_CACHE_KEY);
    localStorage.removeItem(MEMBERS_CACHE_KEY);
    localStorage.removeItem(REPOS_CACHE_KEY);
    loadMembers(true);
    loadRepos(true);
    fetchFirstPage(true);
    loadMergedPRs(true);
  }, [loadMembers, loadRepos, fetchFirstPage, loadMergedPRs]);

  // The app-level Refresh bumps refreshKey: reload open and merged PRs (not on mount).
  const seenRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (seenRefreshKey.current === refreshKey) return;
    seenRefreshKey.current = refreshKey;
    refreshPRs();
    loadMergedPRs(true);
  }, [refreshKey, refreshPRs, loadMergedPRs]);

  return {
    prs,
    loading,
    loadingMore,
    hasNextPage,
    isMultiMode,
    fetchNextPage,
    mergedPRs,
    mergedPRsLoading,
    authors,
    setAuthors,
    selectedRepos,
    setSelectedRepos,
    members,
    orgRepos,
    subTab,
    setSubTab,
    refreshPRs,
    refreshMembers,
    refreshRepos,
    refreshAll,
  };
}
