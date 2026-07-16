import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Spinner from "react-bootstrap/Spinner";
import { IconRefresh, IconFold, IconFoldDown, IconLock } from "@tabler/icons-react";
import "./TeamPRsTab.css";
import type { GitHubPR, JiraIssue } from "../../types";
import type { ClaudeAction, ClaudeSession } from "../../types/claude";
import type { TeamMember } from "../../types/teams";
import { fetchTeamMembers } from "../../services/teams";
import {
  fetchOrgPRsMulti,
  fetchRecentlyMergedPRs,
  fetchOrgRepos,
  OrgRepo,
} from "../../services/github";
import { PRTable, PRTableHandle } from "../../components/PRTable";
import { MultiSelectDropdown } from "../../components/MultiSelectDropdown";
import { DropdownItem } from "../../components/SearchableDropdown";
import { EmptyState } from "../../components/EmptyState";
import { effectiveAuthors } from "./teamPrsFilters";

interface TeamPRsTabProps {
  /** True while the PRs tab is the visible tab — gates fetching so a hidden tab
      doesn't fetch in the background when the team changes. */
  active: boolean;
  /** True once backend config (and thus the resolved API port) is ready. */
  configured: boolean;
  teamId: number;
  teamName: string;
  jiraBaseUrl?: string;
  jiraIssues?: JiraIssue[];
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

/**
 * Team PRs — the Org PRs experience with authors locked to the selected team's
 * roster. A member sub-filter narrows within the team; a repo filter scopes by
 * repository. Not sprint-scoped: shows all open PRs by team members plus recently
 * merged (last 2 weeks), mirroring Org PRs.
 */
export function TeamPRsTab({
  active,
  configured,
  teamId,
  teamName,
  jiraBaseUrl,
  jiraIssues,
  claudeEnabled,
  claudeSessions,
  onClaudeAction,
  onViewClaudeSession,
}: TeamPRsTabProps) {
  const prTableRef = useRef<PRTableHandle>(null);
  const [groupState, setGroupState] = useState({ hasGroups: false, allCollapsed: false });

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [orgRepos, setOrgRepos] = useState<OrgRepo[]>([]);

  const [subTab, setSubTab] = useState<"open" | "merged">("open");
  const [prs, setPrs] = useState<GitHubPR[]>([]);
  const [loading, setLoading] = useState(false);
  const [mergedPRs, setMergedPRs] = useState<GitHubPR[]>([]);
  const [mergedLoading, setMergedLoading] = useState(false);

  // Reset selections when the team changes — a different roster invalidates them.
  useEffect(() => {
    setSelectedMembers([]);
    setSelectedRepos([]);
    setPrs([]);
    setMergedPRs([]);
  }, [teamId]);

  // --- roster (locked author set) ---
  useEffect(() => {
    if (!active || !configured || !teamId) return;
    let cancelled = false;
    setMembersLoading(true);
    fetchTeamMembers(teamId)
      .then((data) => {
        if (!cancelled) setMembers(data);
      })
      .catch((err) => console.error("Failed to fetch team members:", err))
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, configured, teamId]);

  // --- org repos (for the repo filter) ---
  useEffect(() => {
    if (!active || !configured || orgRepos.length > 0) return;
    fetchOrgRepos()
      .then(setOrgRepos)
      .catch((err) => console.error("Failed to fetch org repos:", err));
  }, [active, configured, orgRepos.length]);

  const authors = useMemo(
    () => effectiveAuthors(members, selectedMembers),
    [members, selectedMembers],
  );

  const loadOpenPRs = useCallback(async () => {
    if (!active || !configured) return;
    if (authors.length === 0) {
      setPrs([]);
      return;
    }
    setLoading(true);
    try {
      setPrs(await fetchOrgPRsMulti(authors, selectedRepos));
    } catch (err) {
      console.error("Failed to fetch team PRs:", err);
    } finally {
      setLoading(false);
    }
  }, [active, configured, authors, selectedRepos]);

  const loadMergedPRs = useCallback(async () => {
    if (!active || !configured) return;
    if (authors.length === 0) {
      setMergedPRs([]);
      return;
    }
    setMergedLoading(true);
    try {
      setMergedPRs(await fetchRecentlyMergedPRs("org", authors, selectedRepos));
    } catch (err) {
      console.error("Failed to fetch recently merged team PRs:", err);
    } finally {
      setMergedLoading(false);
    }
  }, [active, configured, authors, selectedRepos]);

  useEffect(() => {
    loadOpenPRs();
  }, [loadOpenPRs]);

  useEffect(() => {
    loadMergedPRs();
  }, [loadMergedPRs]);

  const refresh = useCallback(() => {
    loadOpenPRs();
    loadMergedPRs();
  }, [loadOpenPRs, loadMergedPRs]);

  // --- dropdown items ---
  const memberItems = useMemo<DropdownItem[]>(
    () =>
      members
        .filter((m) => m.github_username?.trim())
        .map((m) => ({ value: m.github_username, label: m.display_name || m.github_username })),
    [members],
  );

  const repoItems = useMemo<DropdownItem[]>(
    () => orgRepos.map((r) => ({ value: r.full_name, label: r.name })),
    [orgRepos],
  );

  const hasLinkedMembers = memberItems.length > 0;

  return (
    <>
      {/* One toolbar: member/repo filters (left) · collapse + Open/Merged + refresh (right).
          Authors are locked to the roster, signalled by the lock icon on the members
          filter — so there's no separate sub-tab bar. */}
      <div className="d-flex align-items-center justify-content-between mb-3 gap-2 flex-wrap">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <MultiSelectDropdown
            items={memberItems}
            values={selectedMembers}
            onChange={setSelectedMembers}
            placeholder="Search members..."
            allLabel="All members"
            triggerIcon={
              <span
                className="d-inline-flex"
                title={`Authors locked to ${teamName} (${memberItems.length})`}
              >
                <IconLock size={13} style={{ opacity: 0.6, flexShrink: 0 }} />
              </span>
            }
          />
          <MultiSelectDropdown
            items={repoItems}
            values={selectedRepos}
            onChange={setSelectedRepos}
            placeholder="Search repos..."
            allLabel="All repos"
          />
        </div>
        <div className="d-flex align-items-center gap-2">
          {(loading || mergedLoading || membersLoading) && (
            <Spinner animation="border" size="sm" variant="secondary" />
          )}
          {subTab === "open" && groupState.hasGroups && (
            <button
              type="button"
              className="pr-table-collapse-btn pr-toolbar-btn"
              onClick={() => prTableRef.current?.toggleCollapseAll()}
              title={groupState.allCollapsed ? "Expand all groups" : "Collapse all groups"}
            >
              {groupState.allCollapsed ? <IconFoldDown size={14} /> : <IconFold size={14} />}
              {groupState.allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
          <div className="pr-view-toggle" role="tablist" aria-label="PR state">
            <button
              type="button"
              role="tab"
              aria-selected={subTab === "open"}
              className={subTab === "open" ? "active" : ""}
              onClick={() => setSubTab("open")}
            >
              Open{!loading && ` (${prs.length})`}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === "merged"}
              className={subTab === "merged" ? "active" : ""}
              onClick={() => setSubTab("merged")}
            >
              Merged{!mergedLoading && ` (${mergedPRs.length})`}
            </button>
          </div>
          <button
            type="button"
            className="pr-table-collapse-btn pr-toolbar-btn"
            onClick={refresh}
            disabled={loading || mergedLoading}
            title="Refresh"
          >
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

      {!hasLinkedMembers && !membersLoading ? (
        <EmptyState
          icon={<IconLock size={32} />}
          title="No GitHub-linked members"
          description={`${teamName} has no members with a GitHub username set. Add usernames in Manage Teams to see their pull requests here.`}
        />
      ) : subTab === "open" ? (
        <div
          style={{
            opacity: loading && prs.length > 0 ? 0.45 : 1,
            pointerEvents: loading && prs.length > 0 ? "none" : "auto",
            transition: "opacity 0.15s ease",
          }}
        >
          <PRTable
            ref={prTableRef}
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
      ) : (
        <PRTable
          prs={mergedPRs}
          loading={mergedLoading}
          variant="recently-merged-org"
          jiraBaseUrl={jiraBaseUrl}
        />
      )}
    </>
  );
}
