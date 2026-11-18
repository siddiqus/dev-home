import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Spinner from "react-bootstrap/Spinner";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import { IconRefresh, IconFilter, IconFold, IconFoldDown } from "@tabler/icons-react";
import "../prs/PRsView.css";
import { GitHubPR, JiraIssue } from "../../types";
import { PRTable, PRTableHandle } from "../../components/PRTable";
import { PRDetailModal } from "../../components/PRDetailModal";
import { Toast, useToast } from "../../components/Toast";
import { isTypingTarget } from "../../utils/dom";
import { RequestReviewIconContext } from "../../components/RequestReviewButton";
import { DropdownItem } from "../../components/SearchableDropdown";
import { MultiSelectDropdown } from "../../components/MultiSelectDropdown";
import { SavedFiltersDropdown, SavedFilter } from "../../components/SavedFiltersDropdown";
import {
  fetchSavedFilters,
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
} from "../../services/filters";
import { useOrgPRSearch } from "./useOrgPRSearch";
import { noMatches, PRSearchBox } from "./PRSearchBox";
import { authorItems as buildAuthorItems } from "./authorItems";
import { teamPicksLabel } from "../../utils/authorPicks";

// --- OrgPRsView ---

interface OrgPRsViewProps {
  configured: boolean;
  jiraBaseUrl: string;
  jiraIssues?: JiraIssue[];
  refreshKey?: number;
}

export const OrgPRsView: React.FC<OrgPRsViewProps> = ({
  configured,
  jiraBaseUrl,
  jiraIssues,
  refreshKey,
}) => {
  const orgPrTableRef = useRef<PRTableHandle>(null);
  const orgMergedTableRef = useRef<PRTableHandle>(null);
  const [groupState, setGroupState] = useState({ hasGroups: false, allCollapsed: false });

  const {
    prs,
    loading,
    loadingMore,
    hasNextPage,
    isMultiMode,
    fetchNextPage,
    mergedPRs,
    mergedPRsLoading,
    mergedPRsKnown,
    authors,
    setAuthors,
    selectedRepos,
    setSelectedRepos,
    query,
    setQuery,
    members,
    membersLoading,
    teams,
    orgRepos,
    reposLoading,
    subTab: orgSubTab,
    setSubTab: handleOrgSubTab,
    refreshPRs,
    refreshMembers,
    refreshRepos,
    refreshAll,
  } = useOrgPRSearch({ configured, refreshKey });

  // A pasted PR link opens here; a link that won't load says so in the toast.
  const [linkedPR, setLinkedPR] = useState<GitHubPR | null>(null);
  const toast = useToast();
  const showToast = toast.show;

  // "/" jumps to the search box, as on GitHub.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.target instanceof Element && e.target.closest(".modal")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
  // Teams above people; a picked team searches as its members.
  const authorItems = useMemo(() => buildAuthorItems(members, teams), [members, teams]);

  const repoItems = useMemo<DropdownItem[]>(
    () => orgRepos.map((r) => ({ value: r.full_name, label: r.name })),
    [orgRepos],
  );

  // A table is only mounted once an author/repo is picked or text searched; gate the
  // collapse control on the same condition so it can't linger on the empty state.
  const hasSelection = authors.length > 0 || selectedRepos.length > 0 || !!query;

  return (
    <div className="prs-view">
      <div className="mb-2">
        <PRSearchBox
          query={query}
          onSearch={setQuery}
          onOpenPR={setLinkedPR}
          onLinkError={(message) => showToast(message, { tone: "danger" })}
          busy={!!query && (orgSubTab === "open" ? loading : mergedPRsLoading)}
          slashHint
          inputRef={searchRef}
        />
      </div>
      {/* Toolbar: filters (left) + subtabs + refresh (right) */}
      <div className="prs-toolbar d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-2">
          <MultiSelectDropdown
            items={authorItems}
            values={authors}
            onChange={handleAuthorsChange}
            placeholder="Search people or teams..."
            allLabel="Select author(s)"
            loading={membersLoading}
            selectionLabel={teamPicksLabel(authors, teams)}
          />
          <MultiSelectDropdown
            items={repoItems}
            values={selectedRepos}
            onChange={handleReposChange}
            placeholder="Search repos..."
            allLabel="Select repo(s)"
            loading={reposLoading}
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
              <Dropdown.Item onClick={refreshMembers}>Refresh people and teams</Dropdown.Item>
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
            Merged{mergedPRsKnown && ` (${mergedPRs.length})`}
          </button>
        </div>
        {hasSelection && groupState.hasGroups && (
          <div className="prs-view-actions">
            <button
              type="button"
              className="pr-table-collapse-btn"
              onClick={() =>
                (orgSubTab === "open"
                  ? orgPrTableRef
                  : orgMergedTableRef
                ).current?.toggleCollapseAll()
              }
              title={groupState.allCollapsed ? "Expand all groups" : "Collapse all groups"}
            >
              {groupState.allCollapsed ? <IconFoldDown size={14} /> : <IconFold size={14} />}
              {groupState.allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          </div>
        )}
      </div>

      <RequestReviewIconContext.Provider value>
        <div className="prs-scroll-body">
          {!hasSelection ? (
            <div
              className="d-flex flex-column align-items-center justify-content-center py-5"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <IconFilter size={32} stroke={1.2} style={{ marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: 4 }}>
                Search, or pick a filter
              </div>
              <div style={{ fontSize: "0.8125rem" }}>
                Type anything and press Enter, paste a PR link, or choose an author, team or repo.
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
                      empty={query ? noMatches(query, false) : undefined}
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
                  ref={orgMergedTableRef}
                  prs={mergedPRs}
                  loading={mergedPRsLoading}
                  variant="recently-merged-org"
                  jiraBaseUrl={jiraBaseUrl}
                  empty={query ? noMatches(query, true) : undefined}
                  onCollapseStateChange={(hasGroups, allCollapsed) =>
                    setGroupState({ hasGroups, allCollapsed })
                  }
                />
              )}
            </>
          )}
        </div>
      </RequestReviewIconContext.Provider>
      <PRDetailModal pr={linkedPR} onHide={() => setLinkedPR(null)} jiraBaseUrl={jiraBaseUrl} />
      <Toast message={toast.message} visible={toast.visible} tone={toast.tone} />
    </div>
  );
};
