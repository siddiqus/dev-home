import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { IconFold, IconFoldDown, IconList, IconLayoutRows, IconX } from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../../types";
import type { ClaudeAction, ClaudeSession } from "../../types/claude";
import { fetchRecentlyMergedPRs } from "../../services/github";
import { extractTicketKey, sourceFromPR } from "../../utils/tickets";
import { ACTIONABLE_REASONS } from "../../utils/prCategories";
import { PRTable, PRTableHandle } from "../../components/PRTable";
import { PRSections, PRSectionsHandle } from "../../components/PRSections";
import { SearchInput } from "../../components/SearchInput";
import { MultiSelectDropdown } from "../../components/MultiSelectDropdown";
import { DropdownItem } from "../../components/SearchableDropdown";
import "./PRsView.css";

type PRSubTab = "open" | "merged";
type PRViewMode = "segments" | "flat";

interface PRsViewProps {
  openPRs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
  jiraBaseUrl?: string;
  configured: boolean;
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

export const PRsView: React.FC<PRsViewProps> = ({
  openPRs,
  loading,
  jiraIssues,
  jiraBaseUrl,
  configured,
  refreshKey,
  claudeEnabled,
  claudeSessions,
  onClaudeAction,
  onViewClaudeSession,
}) => {
  const [subTab, setSubTab] = useState<PRSubTab>(() => {
    return (localStorage.getItem("dev-home-prs-subtab") as PRSubTab) || "open";
  });

  const handleSubTab = (tab: PRSubTab) => {
    setSubTab(tab);
    localStorage.setItem("dev-home-prs-subtab", tab);
  };

  // Open-PRs body layout: "segments" groups PRs into action buckets (Ready /
  // Needs action / …); "flat" is a single Jira-clustered list.
  const [viewMode, setViewMode] = useState<PRViewMode>(() => {
    return (localStorage.getItem("dev-home-prs-view-mode") as PRViewMode) || "segments";
  });

  const handleViewMode = (mode: PRViewMode) => {
    setViewMode(mode);
    localStorage.setItem("dev-home-prs-view-mode", mode);
  };

  const prSectionsRef = useRef<PRSectionsHandle>(null);
  const prTableRef = useRef<PRTableHandle>(null);
  const mergedTableRef = useRef<PRTableHandle>(null);
  const [groupState, setGroupState] = useState({ hasGroups: false, allCollapsed: false });

  // Sidebar filters — Open-PRs only. Recently Merged intentionally has no
  // filters, so this state never leaks across sub-tabs (it stays put while
  // you're on Merged and is still here when you switch back to Open).
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  // "Actionable" reasons (your turn / CI failed / …) and Jira ticket keys.
  const [selectedActionable, setSelectedActionable] = useState<string[]>([]);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedRepos.length > 0 ||
    selectedLabels.length > 0 ||
    selectedActionable.length > 0 ||
    selectedTickets.length > 0;
  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedRepos([]);
    setSelectedLabels([]);
    setSelectedActionable([]);
    setSelectedTickets([]);
  }, []);

  const [mergedPRs, setMergedPRs] = useState<GitHubPR[]>([]);
  const [mergedPRsLoading, setMergedPRsLoading] = useState(false);

  // Per-facet predicates. Each answers "does this PR pass THIS filter?" in
  // isolation, so we can compose them freely: the filtered list ANDs all five,
  // while each sidebar dropdown's option counts apply every predicate EXCEPT its
  // own (faceted counts — see below).
  const matchesSearch = useCallback(
    (pr: GitHubPR) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      if (pr.title.toLowerCase().includes(q)) return true;
      // Match "repo#number" (short or full name) plus bare "#number" / number.
      const shortRepo = pr.repo_full_name.split("/").pop() || pr.repo_full_name;
      const ref = `${shortRepo}#${pr.number}`.toLowerCase();
      const fullRef = `${pr.repo_full_name}#${pr.number}`.toLowerCase();
      if (ref.includes(q) || fullRef.includes(q)) return true;
      const ticket = extractTicketKey(sourceFromPR(pr));
      if (ticket && ticket.toLowerCase().includes(q)) return true;
      const ticketTitle = ticket
        ? jiraIssues?.find((i) => i.key.toUpperCase() === ticket.toUpperCase())?.summary
        : undefined;
      if (ticketTitle && ticketTitle.toLowerCase().includes(q)) return true;
      return false;
    },
    [searchQuery, jiraIssues],
  );

  const matchesRepo = useCallback(
    (pr: GitHubPR) => selectedRepos.length === 0 || selectedRepos.includes(pr.repo_full_name),
    [selectedRepos],
  );

  // Labels match ALL selected (AND).
  const matchesLabels = useCallback(
    (pr: GitHubPR) => {
      if (selectedLabels.length === 0) return true;
      const names = new Set((pr.labels || []).map((l) => l.name));
      return selectedLabels.every((name) => names.has(name));
    },
    [selectedLabels],
  );

  // Actionable reasons match ANY selected (OR).
  const matchesActionable = useCallback(
    (pr: GitHubPR) => {
      if (selectedActionable.length === 0) return true;
      return ACTIONABLE_REASONS.some(
        (reason) => selectedActionable.includes(reason.key) && reason.matches(pr),
      );
    },
    [selectedActionable],
  );

  // Jira tickets match ANY selected key (OR).
  const matchesTickets = useCallback(
    (pr: GitHubPR) => {
      if (selectedTickets.length === 0) return true;
      const key = extractTicketKey(sourceFromPR(pr));
      return key ? selectedTickets.includes(key) : false;
    },
    [selectedTickets],
  );

  // Repo filter options derived from the loaded open PRs (the only list the
  // sidebar filters). Label is the short repo name. Count = how many PRs match
  // every OTHER active filter, so selecting a label narrows these numbers.
  const repoItems = useMemo<DropdownItem[]>(() => {
    const base = openPRs.filter(
      (pr) => matchesSearch(pr) && matchesLabels(pr) && matchesActionable(pr) && matchesTickets(pr),
    );
    const counts = new Map<string, number>();
    for (const pr of base) counts.set(pr.repo_full_name, (counts.get(pr.repo_full_name) || 0) + 1);
    const names = new Set<string>();
    for (const pr of openPRs) names.add(pr.repo_full_name);
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((full) => ({
        value: full,
        label: full.split("/").pop() || full,
        count: counts.get(full) ?? 0,
      }));
  }, [openPRs, matchesSearch, matchesLabels, matchesActionable, matchesTickets]);

  // Label filter options, derived from the labels present on the loaded open
  // PRs. value === label === the raw label name. Count excludes the label facet.
  const labelItems = useMemo<DropdownItem[]>(() => {
    const base = openPRs.filter(
      (pr) => matchesSearch(pr) && matchesRepo(pr) && matchesActionable(pr) && matchesTickets(pr),
    );
    const counts = new Map<string, number>();
    for (const pr of base)
      for (const label of pr.labels || [])
        counts.set(label.name, (counts.get(label.name) || 0) + 1);
    const names = new Set<string>();
    for (const pr of openPRs) for (const label of pr.labels || []) names.add(label.name);
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name, count: counts.get(name) ?? 0 }));
  }, [openPRs, matchesSearch, matchesRepo, matchesActionable, matchesTickets]);

  // Actionable filter options: only the reasons actually present on the current
  // open PRs, so we never offer a dead option. Applied with OR semantics; count
  // excludes the actionable facet.
  const actionableItems = useMemo<DropdownItem[]>(() => {
    const base = openPRs.filter(
      (pr) => matchesSearch(pr) && matchesRepo(pr) && matchesLabels(pr) && matchesTickets(pr),
    );
    return ACTIONABLE_REASONS.filter((reason) => openPRs.some((pr) => reason.matches(pr))).map(
      (reason) => ({
        value: reason.key,
        label: reason.label,
        count: base.filter((pr) => reason.matches(pr)).length,
      }),
    );
  }, [openPRs, matchesSearch, matchesRepo, matchesLabels, matchesTickets]);

  // Jira ticket options: the distinct keys parsed from the open PRs, labeled with
  // the Jira summary when we have it ("PROJ-1: Fix the thing"). The dropdown's
  // search matches the label, so typing a key or words from the summary works.
  // Count excludes the tickets facet.
  const ticketItems = useMemo<DropdownItem[]>(() => {
    const base = openPRs.filter(
      (pr) => matchesSearch(pr) && matchesRepo(pr) && matchesLabels(pr) && matchesActionable(pr),
    );
    const counts = new Map<string, number>();
    for (const pr of base) {
      const key = extractTicketKey(sourceFromPR(pr));
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    const keys = new Set<string>();
    for (const pr of openPRs) {
      const key = extractTicketKey(sourceFromPR(pr));
      if (key) keys.add(key);
    }
    return Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => {
        const summary = jiraIssues?.find((i) => i.key.toUpperCase() === key.toUpperCase())?.summary;
        return {
          value: key,
          label: summary ? `${key}: ${summary}` : key,
          count: counts.get(key) ?? 0,
        };
      });
  }, [openPRs, jiraIssues, matchesSearch, matchesRepo, matchesLabels, matchesActionable]);

  const loadMergedPRs = useCallback(async () => {
    if (!configured) return;
    setMergedPRsLoading(true);
    try {
      setMergedPRs(await fetchRecentlyMergedPRs("user"));
    } catch (err) {
      console.error("Failed to fetch recently merged PRs:", err);
    } finally {
      setMergedPRsLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    loadMergedPRs();
  }, [loadMergedPRs, refreshKey]);

  // Open PRs pass every facet at once: search, repo, labels (AND), actionable
  // reasons (OR), and Jira tickets (OR).
  const filteredOpenPRs = useMemo(
    () =>
      openPRs.filter(
        (pr) =>
          matchesSearch(pr) &&
          matchesRepo(pr) &&
          matchesLabels(pr) &&
          matchesActionable(pr) &&
          matchesTickets(pr),
      ),
    [openPRs, matchesSearch, matchesRepo, matchesLabels, matchesActionable, matchesTickets],
  );

  return (
    <div className="prs-view">
      <div className="prs-subtab-bar">
        <div className="prs-subtab-group">
          <button
            className={`prs-subtab${subTab === "open" ? " active" : ""}`}
            onClick={() => handleSubTab("open")}
          >
            Open PRs{(openPRs.length > 0 || !loading) && ` (${openPRs.length})`}
          </button>
          <button
            className={`prs-subtab${subTab === "merged" ? " active" : ""}`}
            onClick={() => handleSubTab("merged")}
          >
            Recently Merged{(mergedPRs.length > 0 || !mergedPRsLoading) && ` (${mergedPRs.length})`}
          </button>
        </div>
        <div className="prs-subtab-bar-right">
          {/* Open PRs keeps its filters in the left sidebar (rendered in
              .prs-body below); Recently Merged has no filters. */}
          {subTab === "open" && (
            <div className="prs-view-actions">
              {groupState.hasGroups && (
                <button
                  type="button"
                  className="pr-table-collapse-btn"
                  onClick={() =>
                    (viewMode === "flat" ? prTableRef : prSectionsRef).current?.toggleCollapseAll()
                  }
                  title={groupState.allCollapsed ? "Expand all groups" : "Collapse all groups"}
                >
                  {groupState.allCollapsed ? <IconFoldDown size={14} /> : <IconFold size={14} />}
                  {groupState.allCollapsed ? "Expand all" : "Collapse all"}
                </button>
              )}
              <button
                type="button"
                className="prs-view-toggle-btn"
                onClick={() => handleViewMode(viewMode === "segments" ? "flat" : "segments")}
                title={
                  viewMode === "segments" ? "Switch to flat list" : "Switch to action segments"
                }
                aria-label={
                  viewMode === "segments" ? "Switch to flat list" : "Switch to action segments"
                }
              >
                {viewMode === "segments" ? (
                  <IconList size={16} stroke={1.8} />
                ) : (
                  <IconLayoutRows size={16} stroke={1.8} />
                )}
              </button>
            </div>
          )}
          {subTab === "merged" && groupState.hasGroups && (
            <div className="prs-view-actions">
              <button
                type="button"
                className="pr-table-collapse-btn"
                onClick={() => mergedTableRef.current?.toggleCollapseAll()}
                title={groupState.allCollapsed ? "Expand all groups" : "Collapse all groups"}
              >
                {groupState.allCollapsed ? <IconFoldDown size={14} /> : <IconFold size={14} />}
                {groupState.allCollapsed ? "Expand all" : "Collapse all"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="prs-body">
        {subTab === "open" && (
          <aside className="prs-filter-sidebar">
            <div className="prs-filter-heading">
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="prs-filter-count">
                  {filteredOpenPRs.length} of {openPRs.length}
                </span>
              )}
            </div>

            <div className="prs-filter-group">
              <span className="prs-filter-label">Search</span>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search PRs..."
                className="prs-filter-search"
              />
            </div>

            <div className="prs-filter-group">
              <span className="prs-filter-label">Repositories</span>
              <MultiSelectDropdown
                items={repoItems}
                values={selectedRepos}
                onChange={setSelectedRepos}
                placeholder="Filter repos..."
                allLabel="All repos"
                width="100%"
              />
            </div>

            <div className="prs-filter-group">
              <span className="prs-filter-label">Labels</span>
              <MultiSelectDropdown
                items={labelItems}
                values={selectedLabels}
                onChange={setSelectedLabels}
                placeholder="Filter labels..."
                allLabel="All labels"
                width="100%"
              />
            </div>

            <div className="prs-filter-group">
              <span className="prs-filter-label">Actionable</span>
              <MultiSelectDropdown
                items={actionableItems}
                values={selectedActionable}
                onChange={setSelectedActionable}
                placeholder="Filter actionable..."
                allLabel="All actionable"
                width="100%"
              />
            </div>

            <div className="prs-filter-group">
              <span className="prs-filter-label">Jira tickets</span>
              <MultiSelectDropdown
                items={ticketItems}
                values={selectedTickets}
                onChange={setSelectedTickets}
                placeholder="Filter tickets..."
                allLabel="All tickets"
                width="100%"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="pr-table-collapse-btn prs-filter-clear"
                onClick={clearFilters}
                title="Clear all filters"
              >
                <IconX size={14} />
                Clear filters
              </button>
            )}
          </aside>
        )}

        <div className="prs-scroll-body">
          {subTab === "open" && viewMode === "segments" && (
            <PRSections
              ref={prSectionsRef}
              prs={filteredOpenPRs}
              loading={loading}
              jiraIssues={jiraIssues}
              jiraBaseUrl={jiraBaseUrl}
              claudeEnabled={claudeEnabled}
              claudeSessions={claudeSessions}
              onClaudeAction={onClaudeAction}
              onViewClaudeSession={onViewClaudeSession}
              onCollapseStateChange={(hasGroups, allCollapsed) =>
                setGroupState({ hasGroups, allCollapsed })
              }
            />
          )}
          {subTab === "open" && viewMode === "flat" && (
            <PRTable
              ref={prTableRef}
              prs={filteredOpenPRs}
              loading={loading}
              variant="my-prs"
              jiraIssues={jiraIssues}
              jiraBaseUrl={jiraBaseUrl}
              claudeEnabled={claudeEnabled}
              claudeSessions={claudeSessions}
              onClaudeAction={onClaudeAction}
              onViewClaudeSession={onViewClaudeSession}
              showGroupToolbar={false}
              reasonChips
              onCollapseStateChange={(hasGroups, allCollapsed) =>
                setGroupState({ hasGroups, allCollapsed })
              }
            />
          )}
          {subTab === "merged" && (
            <PRTable
              ref={mergedTableRef}
              prs={mergedPRs}
              loading={mergedPRsLoading}
              variant="recently-merged"
              jiraBaseUrl={jiraBaseUrl}
              onCollapseStateChange={(hasGroups, allCollapsed) =>
                setGroupState({ hasGroups, allCollapsed })
              }
            />
          )}
        </div>
      </div>
    </div>
  );
};
