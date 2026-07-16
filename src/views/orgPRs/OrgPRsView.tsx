import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Spinner from "react-bootstrap/Spinner";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import { IconRefresh, IconFilter, IconFold, IconFoldDown } from "@tabler/icons-react";
import "../prs/PRsView.css";
import { GitHubPR, JiraIssue } from "../../types";
import type { ClaudeAction, ClaudeSession } from "../../types/claude";
import {
  fetchOrgPRs,
  fetchOrgPRsMulti,
  fetchOrgMembers,
  fetchOrgRepos,
  fetchRecentlyMergedPRs,
  OrgMember,
  OrgRepo,
} from "../../services/github";
import { PRTable, PRTableHandle } from "../../components/PRTable";
import { DropdownItem } from "../../components/SearchableDropdown";
import { MultiSelectDropdown } from "../../components/MultiSelectDropdown";
import { SavedFiltersDropdown, SavedFilter } from "../../components/SavedFiltersDropdown";
import {
  fetchSavedFilters,
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
} from "../../services/filters";

// --- localStorage caching ---

const MEMBERS_CACHE_KEY = "dev-home-org-members-cache";
const REPOS_CACHE_KEY = "dev-home-org-repos-cache";
const PRS_CACHE_KEY = "dev-home-org-prs-cache-v2";
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
  authors: string[];
  repos: string[];
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

// --- OrgPRsView ---

interface OrgPRsViewProps {
  configured: boolean;
  jiraBaseUrl: string;
  jiraIssues?: JiraIssue[];
  refreshKey?: number;
  claudeEnabled?: boolean;
  claudeSessions?: ClaudeSession[];
  onClaudeAction?: (
    pr: {
      number: number;
      repo_full_name: string;
      title: string;
      headBranch: string;
      baseBranch: string;
    },
    action: ClaudeAction,
    customPrompt?: string,
  ) => void;
  onViewClaudeSession?: (sessionId: string) => void;
}

export const OrgPRsView: React.FC<OrgPRsViewProps> = ({
  configured,
  jiraBaseUrl,
  jiraIssues,
  refreshKey,
  claudeEnabled,
  claudeSessions,
  onClaudeAction,
  onViewClaudeSession,
}) => {
  const orgPrTableRef = useRef<PRTableHandle>(null);
  const [groupState, setGroupState] = useState({ hasGroups: false, allCollapsed: false });

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

  // Sub-tab state
  const [orgSubTab, setOrgSubTab] = useState<"open" | "merged">(() => {
    return (localStorage.getItem("dev-home-org-prs-subtab") as "open" | "merged") || "open";
  });
  const handleOrgSubTab = (tab: "open" | "merged") => {
    setOrgSubTab(tab);
    localStorage.setItem("dev-home-org-prs-subtab", tab);
  };

  // Recently merged PRs
  const [mergedPRs, setMergedPRs] = useState<GitHubPR[]>([]);
  const [mergedPRsLoading, setMergedPRsLoading] = useState(false);
  const loadMergedPRs = useCallback(async () => {
    if (!configured) return;
    if (authors.length === 0 && selectedRepos.length === 0) {
      setMergedPRs([]);
      return;
    }
    setMergedPRsLoading(true);
    try {
      setMergedPRs(await fetchRecentlyMergedPRs("org", authors, selectedRepos));
    } catch (err) {
      console.error("Failed to fetch recently merged PRs:", err);
    } finally {
      setMergedPRsLoading(false);
    }
  }, [configured, authors, selectedRepos]);
  useEffect(() => {
    loadMergedPRs();
  }, [loadMergedPRs, refreshKey]);

  // Saved filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeFilterId, setActiveFilterId] = useState<number | null>(null);

  // Clear active filter when all selections are removed
  useEffect(() => {
    if (authors.length === 0 && selectedRepos.length === 0) {
      setActiveFilterId(null);
    }
  }, [authors, selectedRepos]);

  // Load saved filters from API
  useEffect(() => {
    fetchSavedFilters()
      .then((filters) => {
        setSavedFilters(
          filters.map((f) => ({
            id: f.id,
            name: f.name,
            authors: f.filter_config.authors ?? [],
            repos: f.filter_config.repos ?? [],
          })),
        );
      })
      .catch((err) => console.error("Failed to load saved filters:", err));
  }, []);

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
      if (!skipCache && orgRepos.length > 0) return;
      try {
        const data = await fetchOrgRepos();
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
  // In multi mode we fan out individual API calls and merge, so cursor pagination is unavailable.
  const isMultiMode = authors.length > 1 || selectedRepos.length > 1;

  // Fetch first page when filters change
  const fetchFirstPage = useCallback(
    async (skipCache = false) => {
      if (!configured) return;
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
      try {
        if (isMultiMode) {
          // Fan out per-author (x per-repo) calls and merge results
          const merged = await fetchOrgPRsMulti(authors, selectedRepos);
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
        setLoading(false);
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
    setLoadingMore(true);
    try {
      const author = authors[0] || undefined;
      const repo = selectedRepos[0] || undefined;
      const result = await fetchOrgPRs(endCursor, author, repo);
      const merged = [...prs, ...result.prs];
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
      setLoadingMore(false);
    }
  }, [hasNextPage, endCursor, authors, selectedRepos, loadingMore, prs, isMultiMode]);

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

  // Saved filter handlers
  const handleSaveFilter = useCallback(
    async (name: string) => {
      try {
        const created = await createSavedFilter(name, {
          authors: [...authors],
          repos: [...selectedRepos],
        });
        setSavedFilters((prev) => [
          ...prev,
          {
            id: created.id,
            name: created.name,
            authors: created.filter_config.authors ?? [],
            repos: created.filter_config.repos ?? [],
          },
        ]);
      } catch (err) {
        console.error("Failed to save filter:", err);
      }
    },
    [authors, selectedRepos],
  );

  const handleUpdateFilter = useCallback(
    async (
      id: number,
      data: { name?: string; filter_config?: { authors: string[]; repos: string[] } },
    ) => {
      try {
        const updated = await updateSavedFilter(id, data);
        setSavedFilters((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  id: updated.id,
                  name: updated.name,
                  authors: updated.filter_config.authors ?? [],
                  repos: updated.filter_config.repos ?? [],
                }
              : f,
          ),
        );
      } catch (err) {
        console.error("Failed to update filter:", err);
      }
    },
    [],
  );

  const handleDeleteFilter = useCallback(async (id: number) => {
    try {
      await deleteSavedFilter(id);
      setSavedFilters((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      console.error("Failed to delete filter:", err);
    }
  }, []);

  const handleApplyFilter = useCallback((filter: SavedFilter) => {
    setAuthors(filter.authors);
    setSelectedRepos(filter.repos);
    setActiveFilterId(filter.id);
  }, []);

  const handleAuthorsChange = useCallback((vals: string[]) => {
    setAuthors(vals);
  }, []);

  const handleReposChange = useCallback((vals: string[]) => {
    setSelectedRepos(vals);
  }, []);

  // Dropdown items
  const authorItems = useMemo<DropdownItem[]>(
    () => members.map((m) => ({ value: m.login, label: m.login, icon: m.avatar_url })),
    [members],
  );

  const repoItems = useMemo<DropdownItem[]>(
    () => orgRepos.map((r) => ({ value: r.full_name, label: r.name })),
    [orgRepos],
  );

  return (
    <>
      {/* Toolbar: filters (left) + subtabs + refresh (right) */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-2">
          <MultiSelectDropdown
            items={authorItems}
            values={authors}
            onChange={handleAuthorsChange}
            placeholder="Search authors..."
            allLabel="All authors"
          />
          <MultiSelectDropdown
            items={repoItems}
            values={selectedRepos}
            onChange={handleReposChange}
            placeholder="Search repos..."
            allLabel="All repos"
          />
          <div className="toolbar-divider" />
          <SavedFiltersDropdown
            filters={savedFilters}
            onApply={handleApplyFilter}
            onDelete={handleDeleteFilter}
            canSave={authors.length > 0 || selectedRepos.length > 0}
            onSave={handleSaveFilter}
            onUpdate={handleUpdateFilter}
            activeFilterId={activeFilterId}
            onClearActive={() => {
              setActiveFilterId(null);
              setAuthors([]);
              setSelectedRepos([]);
            }}
            currentAuthors={authors}
            currentRepos={selectedRepos}
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
              style={{ height: 28, padding: "0 8px" }}
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

      <div className="prs-subtab-bar">
        <div className="prs-subtab-group">
          <button
            className={`prs-subtab${orgSubTab === "open" ? " active" : ""}`}
            onClick={() => handleOrgSubTab("open")}
          >
            Open PRs{!loading && ` (${prs.length})`}
          </button>
          <button
            className={`prs-subtab${orgSubTab === "merged" ? " active" : ""}`}
            onClick={() => handleOrgSubTab("merged")}
          >
            Merged{!mergedPRsLoading && ` (${mergedPRs.length})`}
          </button>
        </div>
        {orgSubTab === "open" && groupState.hasGroups && (
          <button
            type="button"
            className="pr-table-collapse-btn"
            onClick={() => orgPrTableRef.current?.toggleCollapseAll()}
            title={groupState.allCollapsed ? "Expand all groups" : "Collapse all groups"}
          >
            {groupState.allCollapsed ? <IconFoldDown size={14} /> : <IconFold size={14} />}
            {groupState.allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        )}
      </div>

      {authors.length === 0 && selectedRepos.length === 0 ? (
        <div
          className="d-flex flex-column align-items-center justify-content-center py-5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <IconFilter size={32} stroke={1.2} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: 4 }}>
            Select a filter to view PRs
          </div>
          <div style={{ fontSize: "0.8125rem" }}>
            Choose at least one author or repository above.
          </div>
        </div>
      ) : (
        <>
          {orgSubTab === "open" && (
            <>
              <div
                style={{
                  opacity: loading && prs.length > 0 ? 0.45 : 1,
                  pointerEvents: loading && prs.length > 0 ? "none" : "auto",
                  transition: "opacity 0.15s ease",
                }}
              >
                <PRTable
                  ref={orgPrTableRef}
                  prs={prs}
                  loading={loading}
                  jiraBaseUrl={jiraBaseUrl}
                  jiraIssues={jiraIssues}
                  variant="org-prs"
                  claudeEnabled={claudeEnabled}
                  claudeSessions={claudeSessions}
                  onClaudeAction={onClaudeAction}
                  onViewClaudeSession={onViewClaudeSession}
                  onCollapseStateChange={(hasGroups, allCollapsed) =>
                    setGroupState({ hasGroups, allCollapsed })
                  }
                />
              </div>

              {hasNextPage && !isMultiMode && (
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
          )}

          {orgSubTab === "merged" && (
            <PRTable
              prs={mergedPRs}
              loading={mergedPRsLoading}
              variant="recently-merged-org"
              jiraBaseUrl={jiraBaseUrl}
            />
          )}
        </>
      )}
    </>
  );
};
