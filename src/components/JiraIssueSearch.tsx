import React, { useState, useEffect, useCallback, useMemo } from "react";
import Spinner from "react-bootstrap/Spinner";
import {
  IconSearch,
  IconPlayerPlay,
  IconDeviceFloppy,
  IconBookmark,
  IconFilter,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { JiraIssue } from "../types";
import { EmptyState } from "./EmptyState";
import { JiraIssueTable } from "./JiraIssueTable";
import { SearchableDropdown } from "./SearchableDropdown";
import {
  JqlFilter,
  RemoteJiraFilter,
  fetchLocalJqlFilters,
  createLocalJqlFilter,
  deleteLocalJqlFilter,
  fetchRemoteJiraFilters,
  searchJql,
} from "../services/jiraFilters";
import "./JiraIssueSearch.css";

interface JiraIssueSearchProps {
  baseUrl?: string;
}

export const JiraIssueSearch: React.FC<JiraIssueSearchProps> = ({ baseUrl }) => {
  const PAGE_SIZE = 50;
  const [jql, setJql] = useState("");
  const [results, setResults] = useState<JiraIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [localFilters, setLocalFilters] = useState<JqlFilter[]>([]);
  const [remoteFilters, setRemoteFilters] = useState<RemoteJiraFilter[]>([]);
  const [loadingRemoteFilters, setLoadingRemoteFilters] = useState(false);

  const [showSaveInput, setShowSaveInput] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [activeFilterName, setActiveFilterName] = useState<string | null>(null);

  const [selectedLocalFilter, setSelectedLocalFilter] = useState("");
  const [selectedRemoteFilter, setSelectedRemoteFilter] = useState("");

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const loadFilters = useCallback(async () => {
    try {
      const filters = await fetchLocalJqlFilters();
      setLocalFilters(filters);
    } catch {
      // silent
    }
  }, []);

  const loadRemoteFilters = useCallback(async () => {
    const CACHE_KEY = "dev-home-jira-remote-filters";
    const DAY_MS = 24 * 60 * 60 * 1000;

    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (Date.now() - cached.ts < DAY_MS) {
          setRemoteFilters(cached.filters);
          return;
        }
      }
    } catch {
      // ignore corrupt cache
    }

    setLoadingRemoteFilters(true);
    try {
      const filters = await fetchRemoteJiraFilters();
      setRemoteFilters(filters);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ filters, ts: Date.now() }));
    } catch {
      // silent
    } finally {
      setLoadingRemoteFilters(false);
    }
  }, []);

  useEffect(() => {
    loadFilters();
    loadRemoteFilters();
  }, [loadFilters, loadRemoteFilters]);

  const runSearch = useCallback(
    async (query: string, token?: string | null, label?: string, pageNum = 1) => {
      if (!query.trim()) return;
      setSearching(true);
      setSearchError(null);
      setHasSearched(true);
      setPage(pageNum);
      if (label !== undefined) setActiveFilterName(label || null);
      try {
        const { issues, total: t, nextPageToken: npt } = await searchJql(query, token);
        setResults(issues);
        setTotal(t);
        setNextToken(npt);
      } catch (err: any) {
        const msg = err?.response?.data?.error || err?.message || "Search failed";
        setSearchError(msg);
        setResults([]);
        setTotal(0);
        setNextToken(null);
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  const handleRun = () => runSearch(jql, null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleRun();
    }
  };

  const handleSave = async () => {
    if (!filterName.trim() || !jql.trim()) return;
    await createLocalJqlFilter(filterName.trim(), jql.trim());
    setFilterName("");
    setShowSaveInput(false);
    loadFilters();
  };

  const handleDeleteLocal = async (id: number) => {
    await deleteLocalJqlFilter(id);
    loadFilters();
  };

  const localDropdownItems = useMemo(
    () => localFilters.map((f) => ({ value: String(f.id), label: f.name })),
    [localFilters],
  );

  const remoteDropdownItems = useMemo(
    () =>
      remoteFilters
        .map((f) => ({ value: f.id, label: f.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [remoteFilters],
  );

  const handleLocalFilterChange = (value: string) => {
    setSelectedLocalFilter(value);
    setSelectedRemoteFilter("");
    if (!value) return;
    const filter = localFilters.find((f) => String(f.id) === value);
    if (filter) {
      setJql(filter.jql);
      runSearch(filter.jql, null, filter.name);
    }
  };

  const handleRemoteFilterChange = (value: string) => {
    setSelectedRemoteFilter(value);
    setSelectedLocalFilter("");
    if (!value) return;
    const filter = remoteFilters.find((f) => f.id === value);
    if (filter) {
      setJql(filter.jql);
      runSearch(filter.jql, null, filter.name);
    }
  };

  const handleDeleteLocalDropdown = (value: string) => {
    const id = parseInt(value, 10);
    if (!isNaN(id)) handleDeleteLocal(id);
  };

  return (
    <div className="jira-issue-search">
      {/* Filter dropdowns */}
      <div className="jql-filter-dropdowns">
        <SearchableDropdown
          items={localDropdownItems}
          value={selectedLocalFilter}
          onChange={handleLocalFilterChange}
          placeholder="Search saved filters..."
          allLabel="Saved Filters"
          triggerIcon={<IconBookmark size={14} style={{ opacity: 0.5, flexShrink: 0 }} />}
          onDeleteItem={handleDeleteLocalDropdown}
        />
        <SearchableDropdown
          items={remoteDropdownItems}
          value={selectedRemoteFilter}
          onChange={handleRemoteFilterChange}
          placeholder="Search JIRA filters..."
          allLabel="My JIRA Filters"
          width={400}
          triggerIcon={<IconFilter size={14} style={{ opacity: 0.5, flexShrink: 0 }} />}
          loading={loadingRemoteFilters}
        />
      </div>

      {/* JQL input area */}
      <div className="jql-input-area">
        <div className="jql-input-row">
          <div className="jql-input-wrapper">
            <IconSearch size={14} className="jql-input-icon" />
            <textarea
              className="jql-input"
              value={jql}
              onChange={(e) => setJql(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter JQL query... (Ctrl+Enter to run)"
              rows={2}
            />
          </div>
          <div className="jql-actions">
            <button
              className="btn btn-primary btn-sm d-flex align-items-center gap-1"
              onClick={handleRun}
              disabled={!jql.trim() || searching}
            >
              <IconPlayerPlay size={14} />
              Run
            </button>
            {jql.trim() && (
              <button
                className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                onClick={() => setShowSaveInput(!showSaveInput)}
              >
                <IconDeviceFloppy size={14} />
                Save
              </button>
            )}
          </div>
        </div>

        {showSaveInput && (
          <div className="jql-save-row">
            <input
              type="text"
              className="jql-save-input"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") {
                  setShowSaveInput(false);
                  setFilterName("");
                }
              }}
              placeholder="Filter name..."
              autoFocus
            />
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={handleSave}
              disabled={!filterName.trim()}
            >
              Save
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {searching && (
        <div className="d-flex justify-content-center align-items-center py-5">
          <Spinner animation="border" variant="secondary" />
        </div>
      )}

      {searchError && (
        <div className="jql-search-error">
          <IconAlertTriangle size={16} />
          <div>
            <div style={{ fontWeight: 500 }}>Search failed</div>
            <div style={{ fontSize: "0.8125rem", opacity: 0.8 }}>{searchError}</div>
          </div>
        </div>
      )}

      {!searching && !searchError && hasSearched && results.length === 0 && (
        <EmptyState
          icon={<IconSearch size={40} stroke={1.5} />}
          title="No results"
          description="Your JQL query returned no issues. Try adjusting the query."
        />
      )}

      {!searching && results.length > 0 && (
        <>
          <div className="jql-results-header">
            {activeFilterName && (
              <span className="jql-results-filter-name">{activeFilterName}</span>
            )}
            <span className="jql-results-count">
              {totalPages > 1
                ? `${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + results.length} of ${total} issues`
                : `${total} issues`}
            </span>
          </div>
          <JiraIssueTable issues={results} baseUrl={baseUrl} />
          {totalPages > 1 && (
            <div className="jql-pagination">
              <span className="jql-pagination-info">
                Page {page} of {totalPages}
              </span>
              {nextToken && (
                <button
                  className="btn btn-outline-secondary btn-sm"
                  disabled={searching}
                  onClick={() => runSearch(jql, nextToken, undefined, page + 1)}
                >
                  Next Page
                </button>
              )}
            </div>
          )}
        </>
      )}

      {!hasSearched && !searching && results.length === 0 && (
        <EmptyState
          icon={<IconSearch size={40} stroke={1.5} />}
          title="Search JIRA Issues"
          description="Enter a JQL query above or select a saved filter to search for issues."
        />
      )}
    </div>
  );
};
