import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Spinner from "react-bootstrap/Spinner";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import { IconRefresh } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import {
  fetchOrgPRs,
  fetchOrgMembers,
  fetchOrgRepos,
  OrgMember,
  OrgRepo,
} from "../services/github";
import { PRTable } from "./PRTable";
import { SearchableDropdown, DropdownItem } from "./SearchableDropdown";

// --- localStorage caching ---

const MEMBERS_CACHE_KEY = "dev-home-org-members-cache";
const REPOS_CACHE_KEY = "dev-home-org-repos-cache";
const PRS_CACHE_KEY = "dev-home-org-prs-cache";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function loadCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function saveCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore quota errors
  }
}

interface PRsCacheData {
  prs: GitHubPR[];
  hasNextPage: boolean;
  endCursor: string | null;
  author: string;
  repo: string;
}

// --- OrgPRsView ---

interface OrgPRsViewProps {
  configured: boolean;
  jiraBaseUrl: string;
}

export const OrgPRsView: React.FC<OrgPRsViewProps> = ({ configured, jiraBaseUrl }) => {
  const cachedPRs = useRef(loadCache<PRsCacheData>(PRS_CACHE_KEY));
  const cachedMembers = useRef(loadCache<OrgMember[]>(MEMBERS_CACHE_KEY));
  const cachedRepos = useRef(loadCache<OrgRepo[]>(REPOS_CACHE_KEY));

  const [prs, setPrs] = useState<GitHubPR[]>(cachedPRs.current?.prs ?? []);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(cachedPRs.current?.hasNextPage ?? false);
  const [endCursor, setEndCursor] = useState<string | null>(cachedPRs.current?.endCursor ?? null);
  const [author, setAuthor] = useState(cachedPRs.current?.author ?? "");
  const [repo, setRepo] = useState(cachedPRs.current?.repo ?? "");
  const [members, setMembers] = useState<OrgMember[]>(cachedMembers.current ?? []);
  const [repos, setRepos] = useState<OrgRepo[]>(cachedRepos.current ?? []);

  // Load org members
  const loadMembers = useCallback(
    async (skipCache = false) => {
      if (!configured) return;
      if (!skipCache && members.length > 0) return;
      try {
        const data = await fetchOrgMembers();
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
      if (!skipCache && repos.length > 0) return;
      try {
        const data = await fetchOrgRepos();
        setRepos(data);
        saveCache(REPOS_CACHE_KEY, data);
      } catch (err) {
        console.error("Failed to fetch org repos:", err);
      }
    },
    [configured, repos.length],
  );

  useEffect(() => {
    loadMembers();
    loadRepos();
  }, [loadMembers, loadRepos]);

  // Fetch first page when filters change
  const fetchFirstPage = useCallback(
    async (skipCache = false) => {
      if (!configured) return;

      if (
        !skipCache &&
        cachedPRs.current &&
        cachedPRs.current.author === author &&
        cachedPRs.current.repo === repo
      ) {
        cachedPRs.current = null;
        return;
      }

      setLoading(true);
      try {
        const result = await fetchOrgPRs(undefined, author, repo);
        setPrs(result.prs);
        setHasNextPage(result.pageInfo.hasNextPage);
        setEndCursor(result.pageInfo.endCursor);
        saveCache(PRS_CACHE_KEY, {
          prs: result.prs,
          hasNextPage: result.pageInfo.hasNextPage,
          endCursor: result.pageInfo.endCursor,
          author,
          repo,
        });
      } catch (err) {
        console.error("Failed to fetch org PRs:", err);
      } finally {
        setLoading(false);
      }
    },
    [configured, author, repo],
  );

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  // Fetch next page
  const fetchNextPage = useCallback(async () => {
    if (!hasNextPage || !endCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchOrgPRs(endCursor, author, repo);
      const merged = [...prs, ...result.prs];
      setPrs(merged);
      setHasNextPage(result.pageInfo.hasNextPage);
      setEndCursor(result.pageInfo.endCursor);
      saveCache(PRS_CACHE_KEY, {
        prs: merged,
        hasNextPage: result.pageInfo.hasNextPage,
        endCursor: result.pageInfo.endCursor,
        author,
        repo,
      });
    } catch (err) {
      console.error("Failed to fetch more org PRs:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasNextPage, endCursor, author, repo, loadingMore, prs]);

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
  }, [loadMembers, loadRepos, fetchFirstPage]);

  // Dropdown items
  const authorItems = useMemo<DropdownItem[]>(
    () => members.map((m) => ({ value: m.login, label: m.login, icon: m.avatar_url })),
    [members],
  );

  const repoItems = useMemo<DropdownItem[]>(
    () => repos.map((r) => ({ value: r.full_name, label: r.name })),
    [repos],
  );

  if (loading && prs.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  return (
    <>
      {/* Toolbar: filters (left) + refresh (right) */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-2">
          <SearchableDropdown
            items={authorItems}
            value={author}
            onChange={setAuthor}
            placeholder="Search authors..."
            allLabel="All authors"
          />
          <SearchableDropdown
            items={repoItems}
            value={repo}
            onChange={setRepo}
            placeholder="Search repos..."
            allLabel="All repos"
          />
        </div>
        <div className="d-flex align-items-center gap-2">
          {loading && <Spinner animation="border" size="sm" variant="secondary" />}
          <Dropdown align="end">
            <Dropdown.Toggle
              variant="outline-secondary"
              size="sm"
              id="org-prs-refresh"
              disabled={loading}
              title="Refresh"
            >
              <IconRefresh size={14} />
            </Dropdown.Toggle>
            <Dropdown.Menu style={{ fontSize: "0.8125rem" }}>
              <Dropdown.Item onClick={refreshAll}>Refresh all</Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={refreshPRs}>Refresh PRs</Dropdown.Item>
              <Dropdown.Item onClick={refreshMembers}>Refresh members</Dropdown.Item>
              <Dropdown.Item onClick={refreshRepos}>Refresh repos</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </div>

      <div
        style={{
          opacity: loading && prs.length > 0 ? 0.45 : 1,
          pointerEvents: loading && prs.length > 0 ? "none" : "auto",
          transition: "opacity 0.15s ease",
        }}
      >
        <PRTable prs={prs} loading={loading} jiraBaseUrl={jiraBaseUrl} variant="org-prs" />
      </div>

      {/* Load more button */}
      {hasNextPage && (
        <div className="d-flex justify-content-center py-3">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={fetchNextPage}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Loading...
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </>
  );
};
