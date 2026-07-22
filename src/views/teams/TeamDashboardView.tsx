import { useState, useEffect, useMemo, useCallback } from "react";
import {
  IconChartBar,
  IconUsersGroup,
  IconRun,
  IconGitPullRequest,
  IconChevronRight,
  IconChevronDown,
} from "@tabler/icons-react";
import { useTeams } from "../../hooks/useTeams";
import { useTeamDashboard } from "../../hooks/useTeamDashboard";
import { EmptyState } from "../../components/EmptyState";
import { SearchableDropdown, type DropdownItem } from "../../components/SearchableDropdown";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { JiraIssueDrawer } from "../../components/JiraIssueDrawer";
import { DescriptionModal } from "../../components/DescriptionModal";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { fetchIssuesByKeys } from "../../services/jira";
import { fetchPR } from "../../services/github";
import { formatRelativeTime } from "../../utils/time";
import type { JiraIssue, GitHubPR } from "../../types";
import type { ClaudeAction, ClaudeSession } from "../../types/claude";
import type { LinkedPR, Ref } from "../../types/teams";
import { TeamPRsTab } from "./TeamPRsTab";
import "./TeamDashboardView.css";
// --- Sprint cockpit ---
import { SprintMetaBar } from "./cockpit/SprintMetaBar";
import { NeedsAttentionPanel } from "./cockpit/NeedsAttentionPanel";
import { LoadDistribution } from "./cockpit/LoadDistribution";
import { EpicCards } from "./cockpit/EpicCards";
import { PrFlowSection } from "./cockpit/PrFlowSection";
import { DeliveryHygiene } from "./cockpit/DeliveryHygiene";

interface Props {
  /** True once backend config (and thus the resolved API port) is ready. */
  configured: boolean;
  jiraBaseUrl?: string;
  /** Pre-select this team when navigating in from the teams list. */
  initialTeamId?: number | null;
  // --- Team PRs tab (threaded through to the PRTable, as in Org PRs) ---
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

export function TeamDashboardView({
  configured,
  jiraBaseUrl,
  initialTeamId,
  jiraIssues,
  claudeEnabled,
  claudeSessions,
  onClaudeAction,
  onViewClaudeSession,
}: Props) {
  const { teams } = useTeams(configured);
  const [teamId, setTeamId] = useState<number | null>(initialTeamId ?? null);
  const [sprintId, setSprintId] = useState<number | null>(null);
  // Top-level view: the Jira sprint cockpit, or the team's PRs.
  const [tab, setTab] = useState<"sprint" | "prs">("sprint");
  // Mount the PRs tab lazily on first open, then keep it alive so switching back
  // doesn't refetch (it self-fetches on mount, gated on `active`).
  const [prsEverOpened, setPrsEverOpened] = useState(false);
  useEffect(() => {
    if (tab === "prs") setPrsEverOpened(true);
  }, [tab]);
  // Off-board PRs is a secondary, noisy list — start collapsed.
  const [offBoardCollapsed, setOffBoardCollapsed] = useState(true);

  // This view stays mounted while the app only toggles the active tab, so a new
  // navigation target arrives as a prop change — reflect it (and reset the
  // dependent sprint filter) when it points at a different team.
  useEffect(() => {
    if (initialTeamId != null && initialTeamId !== teamId) {
      setTeamId(initialTeamId);
      setSprintId(null);
    }
  }, [initialTeamId]);

  const { dashboard, loading, error } = useTeamDashboard(teamId, sprintId);

  const teamItems: DropdownItem[] = useMemo(
    () => teams.map((t) => ({ value: String(t.id), label: t.name })),
    [teams],
  );

  const teamName = useMemo(
    () => teams.find((t) => t.id === teamId)?.name ?? dashboard?.team.name ?? "",
    [teams, teamId, dashboard?.team.name],
  );

  const sprintItems: DropdownItem[] = useMemo(
    () =>
      (dashboard?.sprints || []).map((s) => ({
        value: String(s.id),
        label: `${s.name} (${s.state})`,
      })),
    [dashboard?.sprints],
  );

  // The active/default sprint, shown when the user hasn't picked one explicitly.
  const selectedSprintId = sprintId ?? dashboard?.sprint?.id ?? null;

  // The sprint object currently on screen — used by the meta bar.
  const selectedSprint =
    dashboard?.sprints.find((s) => s.id === selectedSprintId) ?? dashboard?.sprint ?? null;

  const staleDaysMap = useMemo(() => {
    if (!dashboard) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const issue of dashboard.issues) {
      if (issue.flags.stale) {
        map.set(issue.key, issue.daysSinceUpdate);
      }
    }
    return map;
  }, [dashboard]);

  // --- Detail modals (Jira drawer + PR description modal) ---
  // Every cockpit panel drills down through a single `openRef` handler; the
  // modals are rendered once here at the dashboard level. Each ref only carries
  // a pointer (issue key / repo+number), so we fetch the full record on click.
  const [drawerIssue, setDrawerIssue] = useState<JiraIssue | null>(null);
  const [drawerPRs, setDrawerPRs] = useState<LinkedPR[]>([]);
  const [modalPR, setModalPR] = useState<GitHubPR | null>(null);
  // A full-page overlay while a detail record is being fetched, so the click
  // gives immediate feedback before the drawer/modal can open.
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerStaleDays, setDrawerStaleDays] = useState<number | undefined>(undefined);

  const openIssue = useCallback(
    (key: string) => {
      setDrawerIssue(null);
      // Linked PRs live on the dashboard row, not the fetched Jira issue.
      // Epics aren't in `issues`, so they resolve to an empty list.
      const match = dashboard?.issues.find((i) => i.key === key);
      setDrawerPRs(match?.linkedPRs ?? []);
      setDrawerStaleDays(match?.flags.stale ? match.daysSinceUpdate : undefined);
      setDetailLoading(true);
      fetchIssuesByKeys([key])
        .then((issues) => {
          if (issues[0]) setDrawerIssue(issues[0]);
        })
        .catch(() => setDrawerIssue(null))
        .finally(() => setDetailLoading(false));
    },
    [dashboard?.issues],
  );

  const openPR = useCallback((repoFullName: string, number: number) => {
    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) return;
    setModalPR(null);
    setDetailLoading(true);
    fetchPR(owner, repo, number)
      .then(setModalPR)
      .catch(() => setModalPR(null))
      .finally(() => setDetailLoading(false));
  }, []);

  // Unified drill-down for the cockpit panels.
  const openRef = useCallback(
    (ref: Ref) => {
      if (ref.kind === "issue") openIssue(ref.key);
      else openPR(ref.repo, ref.number);
    },
    [openIssue, openPR],
  );

  return (
    <div className={`p-3${tab === "prs" ? " team-dashboard--pinned" : ""}`}>
      <div className="d-flex gap-2 mb-3 align-items-center flex-wrap flex-shrink-0">
        <SearchableDropdown
          items={teamItems}
          value={teamId != null ? String(teamId) : ""}
          onChange={(v) => {
            setTeamId(v ? parseInt(v, 10) : null);
            setSprintId(null);
          }}
          placeholder="Search teams…"
          allLabel="Select a team…"
          triggerIcon={<IconUsersGroup size={14} style={{ opacity: 0.5, flexShrink: 0 }} />}
          width={220}
        />

        {teamId != null && (
          <SegmentedTabs
            className="inline-control"
            activeKey={tab}
            onChange={(k) => setTab(k as "sprint" | "prs")}
            tabs={[
              {
                key: "sprint",
                label: (
                  <span className="d-inline-flex align-items-center gap-1">
                    <IconRun size={14} /> Sprint
                  </span>
                ),
              },
              {
                key: "prs",
                label: (
                  <span className="d-inline-flex align-items-center gap-1">
                    <IconGitPullRequest size={14} /> PRs
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>

      {error && <div className="alert alert-danger small">{error}</div>}
      {!teamId && !loading && (
        <EmptyState
          icon={<IconChartBar size={32} />}
          title="Select a team"
          description="Pick a team to see its dashboard."
        />
      )}

      {/* ---- Sprint tab: the Jira cockpit ---- */}
      {teamId != null && (
        <div className={tab === "sprint" ? "" : "d-none"}>
          {dashboard && dashboard.sprints.length > 0 && (
            <div className="d-flex gap-2 mb-3 align-items-center flex-wrap">
              <SearchableDropdown
                items={sprintItems}
                value={selectedSprintId != null ? String(selectedSprintId) : ""}
                onChange={(v) => setSprintId(v ? parseInt(v, 10) : null)}
                placeholder="Search sprints…"
                allLabel="Sprint"
                hideAllOption
                triggerIcon={<IconRun size={14} style={{ opacity: 0.5, flexShrink: 0 }} />}
                width={400}
              />
            </div>
          )}

          {dashboard && (
            <>
              {dashboard.errors.length > 0 && (
                <div className="alert alert-warning small">
                  <ul className="mb-0 ps-3">
                    {dashboard.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sprint meta */}
              <SprintMetaBar
                sprint={selectedSprint}
                pace={dashboard.pace}
                lastSynced={dashboard.syncedAt ?? null}
                jiraBaseUrl={jiraBaseUrl}
                boardId={dashboard.team.board?.id ?? null}
              />

              <div className="mb-3">
                <EpicCards epics={dashboard.epics} onOpenRef={openRef} />
              </div>

              {/* Row 2 — Completion over time + Needs Attention */}
              <div className="row g-3 mb-3">
                <div className="col-lg-7">
                  <LoadDistribution
                    workload={dashboard.workload}
                    loadBalance={dashboard.loadBalance}
                    onOpenRef={openRef}
                    staleDays={staleDaysMap}
                  />
                </div>
                <div className="col-lg-5">
                  <NeedsAttentionPanel
                    needsAttention={dashboard.needsAttention}
                    onOpenRef={openRef}
                    staleDays={staleDaysMap}
                  />
                </div>
              </div>

              <div className="row g-3 mb-3">
                <div className="col-lg-7">
                  <div className="border rounded p-2 h-100">
                    <PrFlowSection prFlow={dashboard.prFlow} />
                  </div>
                </div>
                <div className="col-lg-5">
                  <DeliveryHygiene hygiene={dashboard.hygiene} onOpenRef={openRef} />
                </div>
              </div>

              {/* Off-board PRs — full list */}
              <div className="border rounded p-2" style={{ background: "rgba(255,170,60,.06)" }}>
                <div
                  className="small text-muted d-flex align-items-center gap-1"
                  style={{ cursor: "pointer" }}
                  role="button"
                  onClick={() => setOffBoardCollapsed((c) => !c)}
                >
                  {offBoardCollapsed ? (
                    <IconChevronRight size={14} />
                  ) : (
                    <IconChevronDown size={14} />
                  )}
                  ⚠ PRs OUTSIDE THE SPRINT · last 2 weeks · {dashboard.offBoardPRs.length}
                </div>
                {!offBoardCollapsed &&
                  (dashboard.offBoardPRs.length === 0 ? (
                    <div className="text-muted small mt-2">None.</div>
                  ) : (
                    <table className="table table-sm table-hover mb-0 mt-2">
                      <tbody>
                        {dashboard.offBoardPRs.map((pr) => (
                          <tr
                            key={`${pr.repo_full_name}#${pr.number}`}
                            onClick={() => openPR(pr.repo_full_name, pr.number)}
                            style={{ cursor: "pointer" }}
                          >
                            <td>{pr.author}</td>
                            <td>
                              <a
                                href={pr.html_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                #{pr.number} {pr.title}
                              </a>
                            </td>
                            <td className="text-muted">
                              {pr.ticketKey ? `${pr.ticketKey} (other project)` : "no ticket"}
                            </td>
                            <td>{pr.state}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- PRs tab: Org PRs, authors locked to the team ---- */}
      {teamId != null && prsEverOpened && (
        <div className={tab === "prs" ? "team-dashboard-prs" : "d-none"}>
          <TeamPRsTab
            active={tab === "prs"}
            configured={configured}
            teamId={teamId}
            teamName={teamName}
            jiraBaseUrl={jiraBaseUrl}
            jiraIssues={jiraIssues}
            claudeEnabled={claudeEnabled}
            claudeSessions={claudeSessions}
            onClaudeAction={onClaudeAction}
            onViewClaudeSession={onViewClaudeSession}
          />
        </div>
      )}

      <LoadingOverlay show={loading && tab === "sprint"} label="Loading team data…" />
      <LoadingOverlay show={detailLoading} label="Loading…" />

      <JiraIssueDrawer
        issue={drawerIssue}
        show={!!drawerIssue}
        onHide={() => setDrawerIssue(null)}
        baseUrl={jiraBaseUrl}
        linkedPRs={drawerPRs}
        staleDays={drawerStaleDays}
      />

      <DescriptionModal
        show={!!modalPR}
        onHide={() => setModalPR(null)}
        title={modalPR ? `#${modalPR.number} ${modalPR.title}` : ""}
        subtitle={
          modalPR
            ? `${modalPR.user.login} · ${modalPR.repo_full_name} · ${modalPR.head.ref} · ${formatRelativeTime(modalPR.created_at)}`
            : ""
        }
        description={modalPR?.body || ""}
        url={modalPR?.html_url}
        checks={modalPR?.checks}
      />
    </div>
  );
}
