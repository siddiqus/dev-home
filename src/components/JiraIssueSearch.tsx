import React, { useState, useEffect, useCallback, useMemo } from "react";
import Spinner from "react-bootstrap/Spinner";
import {
  IconSearch,
  IconPlayerPlay,
  IconDeviceFloppy,
  IconBookmark,
  IconFilter,
  IconAlertTriangle,
  IconRefresh,
  IconDownload,
} from "@tabler/icons-react";
import { JiraIssue } from "../types";
import { issuesToTsv, downloadTextFile } from "../utils/tsvExport";
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
  const [jql, setJql] = useState("");
  const [results, setResults] = useState<JiraIssue[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [activeQuery, setActiveQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportTruncated, setExportTruncated] = useState(false);
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

  const forceRefreshRemoteFilters = useCallback(async () => {
    localStorage.removeItem("dev-home-jira-remote-filters");
    setLoadingRemoteFilters(true);
    try {
      const filters = await fetchRemoteJiraFilters();
      setRemoteFilters(filters);
      localStorage.setItem(
        "dev-home-jira-remote-filters",
        JSON.stringify({ filters, ts: Date.now() }),
      );
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

  const runSearch = useCallback(async (query: string, label?: string) => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setHasSearched(true);
    setExportTruncated(false);
    setActiveQuery(query);
    if (label !== undefined) setActiveFilterName(label || null);
    try {
      const { issues, nextPageToken: npt } = await searchJql(query, null);
      setResults(issues);
      setNextToken(npt);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Search failed";
      setSearchError(msg);
      setResults([]);
      setNextToken(null);
    } finally {
      setSearching(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextToken || loadingMore) return;
    setLoadingMore(true);
    setSearchError(null);
    try {
      const { issues, nextPageToken: npt } = await searchJql(activeQuery, nextToken);
      setResults((prev) => [...prev, ...issues]);
      setNextToken(npt);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Failed to load more";
      setSearchError(msg);
    } finally {
      setLoadingMore(false);
    }
  }, [activeQuery, nextToken, loadingMore]);

  const handleExport = useCallback(async () => {
    if (exporting || !activeQuery.trim()) return;
    setExporting(true);
    setExportTruncated(false);
    setSearchError(null);
    try {
      const MAX_PAGES = 100;
      const all: JiraIssue[] = [];
      let token: string | null = null;
      let pages = 0;
      do {
        const { issues, nextPageToken: npt } = await searchJql(activeQuery, token);
        all.push(...issues);
        token = npt;
        pages++;
      } while (token && pages < MAX_PAGES);
      if (token) setExportTruncated(true); // cap reached with more remaining
      const tsv = issuesToTsv(all);
      const date = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local tz
      const base = activeFilterName
        ? activeFilterName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
        : "jira-export";
      downloadTextFile(`${base}-${date}.tsv`, tsv);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Export failed";
      setSearchError(msg);
    } finally {
      setExporting(false);
    }
  }, [exporting, activeQuery, activeFilterName]);

  const handleRun = () => runSearch(jql);

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
      runSearch(filter.jql, filter.name);
    }
  };

  const handleRemoteFilterChange = (value: string) => {
    setSelectedRemoteFilter(value);
    setSelectedLocalFilter("");
    if (!value) return;
    const filter = remoteFilters.find((f) => f.id === value);
    if (filter) {
      setJql(filter.jql);
      runSearch(filter.jql, filter.name);
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
        <button
          className="btn btn-sm btn-icon-only"
          onClick={forceRefreshRemoteFilters}
          disabled={loadingRemoteFilters}
          title="Refresh JIRA filters"
          style={{
            padding: "4px",
            lineHeight: 1,
            border: "none",
            background: "none",
            opacity: 0.5,
          }}
        >
          <IconRefresh size={14} className={loadingRemoteFilters ? "spin" : ""} />
        </button>
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
              {results.length}
              {nextToken ? "+" : ""} issues
            </span>
            <button
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 jql-export-btn"
              onClick={handleExport}
              disabled={exporting}
              title="Export all matching issues as TSV"
            >
              {exporting ? <Spinner animation="border" size="sm" /> : <IconDownload size={14} />}
              Export
            </button>
          </div>
          {exportTruncated && (
            <div className="jql-export-note">
              Exported first 5,000 issues (result set was larger).
            </div>
          )}
          <JiraIssueTable issues={results} baseUrl={baseUrl} />
          {nextToken && (
            <div className="jql-pagination">
              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
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
