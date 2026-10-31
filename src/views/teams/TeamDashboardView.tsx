import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  IconChartBar,
  IconUsersGroup,
  IconRun,
  IconGitPullRequest,
  IconChevronRight,
  IconChevronDown,
  IconRefresh,
  IconAlertTriangle,
  IconExternalLink,
  IconLayoutDashboard,
  IconUsers,
} from "@tabler/icons-react";
import { useTeams } from "../../hooks/useTeams";
import { useTeamDashboard } from "../../hooks/useTeamDashboard";
import { EmptyState } from "../../components/EmptyState";
import { SearchableDropdown, type DropdownItem } from "../../components/SearchableDropdown";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { JiraIssueDrawer } from "../../components/JiraIssueDrawer";
import { PRDetailModal } from "../../components/PRDetailModal";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { fetchIssueDetail } from "../../services/jira";
import { fetchPR } from "../../services/github";
import { formatRelativeTime } from "../../utils/time";
import type { JiraIssue, GitHubPR } from "../../types";
import type { LinkedPR, Ref, SprintResult } from "../../types/teams";
import { TeamPRsTab, type TeamPRsTabHandle } from "./TeamPRsTab";
import "./TeamDashboardView.css";
// --- Sprint cockpit ---
import { SprintMetaBar, sprintBoardUrl } from "./cockpit/SprintMetaBar";
import { NeedsAttentionPanel } from "./cockpit/NeedsAttentionPanel";
import { LoadDistribution } from "./cockpit/LoadDistribution";
import { PeopleView } from "./cockpit/PeopleView";
import { EpicCards } from "./cockpit/EpicCards";
import { DeliveryHygiene } from "./cockpit/DeliveryHygiene";
import { ReviewQueuePanel } from "./cockpit/ReviewQueuePanel";
import { buildRefLookup } from "./cockpit/refLookup";
import { TeamDashboardSkeleton } from "./cockpit/TeamDashboardSkeleton";
import { useStoredId, useStoredState } from "../../hooks/useStoredState";

const TEAM_TABS = ["sprint", "prs"] as const;
const SPRINT_VIEWS = ["overview", "people"] as const;

interface Props {
  /** True once backend config (and thus the resolved API port) is ready. */
  configured: boolean;
  jiraBaseUrl?: string;
  /** Pre-select this team when navigating in from the teams list. */
  initialTeamId?: number | null;
  // --- Team PRs tab (threaded through to the PRTable, as in Org PRs) ---
  jiraIssues?: JiraIssue[];
}

export function TeamDashboardView({ configured, jiraBaseUrl, initialTeamId, jiraIssues }: Props) {
  const { teams } = useTeams(configured);
  // Team and sprint survive a page reload, like the tab.
  const [teamId, setTeamId] = useStoredId("dev-home-team-id");
  const [sprintId, setSprintId] = useStoredId("dev-home-team-sprint");
  // Top-level view: the Jira sprint cockpit, or the team's PRs.
  const [tab, setTab] = useStoredState("dev-home-team-tab", "sprint", TEAM_TABS);
  // Under the epics: the team-wide panels, or one person at a time (standup).
  const [sprintView, setSprintView] = useStoredState(
    "dev-home-team-sprint-view",
    "overview",
    SPRINT_VIEWS,
  );
  // The person shown on the People tab; null = whoever needs help most.
  const [personId, setPersonId] = useState<string | null>(null);
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

  const { dashboard, loading, error, refresh } = useTeamDashboard(teamId, sprintId);

  // One refresh icon, right of the tabs, serves both: it reloads and spins for
  // whichever tab is showing.
  const prsTabRef = useRef<TeamPRsTabHandle>(null);
  const [prsLoading, setPrsLoading] = useState(false);
  const activeLoading = tab === "sprint" ? loading : prsLoading;
  const refreshActive = tab === "sprint" ? refresh : () => prsTabRef.current?.refresh();

  const teamItems: DropdownItem[] = useMemo(
    () => teams.map((t) => ({ value: String(t.id), label: t.name })),
    [teams],
  );

  const teamName = useMemo(
    () => teams.find((t) => t.id === teamId)?.name ?? dashboard?.team.name ?? "",
    [teams, teamId, dashboard?.team.name],
  );

  // The dashboard is cleared while a sprint or refresh loads; remember the
  // team's sprint list (and which one was showing) so the picker and its Jira
  // link stay put.
  const [lastSprints, setLastSprints] = useState<{
    teamId: number;
    sprints: SprintResult[];
    shownId: number | null;
    boardId: number | null;
  } | null>(null);
  useEffect(() => {
    if (dashboard) {
      setLastSprints({
        teamId: dashboard.team.id,
        sprints: dashboard.sprints,
        shownId: dashboard.sprint?.id ?? null,
        boardId: dashboard.team.board?.id ?? null,
      });
    }
  }, [dashboard]);
  const known = lastSprints?.teamId === teamId ? lastSprints : null;
  const sprints = dashboard?.sprints ?? known?.sprints ?? [];

  const sprintItems: DropdownItem[] = useMemo(
    () =>
      sprints.map((s) => ({
        value: String(s.id),
        label: `${s.name} (${s.state})`,
      })),
    [sprints],
  );

  // The active/default sprint, shown when the user hasn't picked one explicitly.
  const selectedSprintId = sprintId ?? dashboard?.sprint?.id ?? known?.shownId ?? null;

  // The sprint object currently on screen — used by the meta bar.
  const selectedSprint =
    dashboard?.sprints.find((s) => s.id === selectedSprintId) ?? dashboard?.sprint ?? null;

  const boardUrl = sprintBoardUrl(
    jiraBaseUrl,
    dashboard?.team.board?.id ?? known?.boardId ?? null,
    selectedSprintId,
  );
  // Last sync time rides on the refresh button's tooltip.
  const refreshLabel = tab === "sprint" ? "Refresh sprint data" : "Refresh PRs";
  const refreshTitle =
    tab === "sprint" && dashboard?.syncedAt
      ? `${refreshLabel} (synced ${formatRelativeTime(dashboard.syncedAt)})`
      : refreshLabel;

  // The backend reports per-source failures as "Source: message" strings.
  const jiraError =
    dashboard?.errors.find((e) => e.startsWith("Jira:"))?.replace(/^Jira:\s*/, "") ?? null;
  const otherErrors = dashboard?.errors.filter((e) => !e.startsWith("Jira:")) ?? [];

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

  // Resolves the panels' bare refs to titles, assignees and PR authors.
  const refLookup = useMemo(
    () => buildRefLookup(dashboard?.issues ?? [], dashboard?.offBoardPRs ?? []),
    [dashboard?.issues, dashboard?.offBoardPRs],
  );

  // PRs pins its toolbar; the Sprint cockpit pins everything down to its
  // overview/people switch. Only what's below them scrolls.
  const pinned = tab === "prs" || (tab === "sprint" && !!dashboard && !jiraError);

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
  const [drawerReloading, setDrawerReloading] = useState(false);
  // Issue key being fetched; the drawer opens on it right away with a spinner.
  const [drawerLoadingKey, setDrawerLoadingKey] = useState<string | null>(null);

  const openIssue = useCallback(
    (key: string) => {
      setDrawerIssue(null);
      // Linked PRs live on the dashboard row, not the fetched Jira issue.
      // Epics aren't in `issues`, so they resolve to an empty list.
      const match = dashboard?.issues.find((i) => i.key === key);
      setDrawerPRs(match?.linkedPRs ?? []);
      setDrawerStaleDays(match?.flags.stale ? match.daysSinceUpdate : undefined);
      setDrawerLoadingKey(key);
      fetchIssueDetail(key)
        .then((issue) => {
          if (issue) setDrawerIssue(issue);
        })
        .catch(() => setDrawerIssue(null))
        .finally(() => setDrawerLoadingKey((cur) => (cur === key ? null : cur)));
    },
    [dashboard?.issues],
  );

  // Bypass the hour-long issue cache; the drawer keeps showing the old copy meanwhile.
  const reloadIssue = useCallback(() => {
    if (!drawerIssue) return;
    const key = drawerIssue.key;
    setDrawerReloading(true);
    fetchIssueDetail(key, { force: true })
      .then((issue) => {
        if (issue) setDrawerIssue((cur) => (cur?.key === key ? issue : cur));
      })
      .catch(() => {})
      .finally(() => setDrawerReloading(false));
  }, [drawerIssue]);

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
    <div className={`p-3${pinned ? " team-dashboard--pinned" : ""}`}>
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

        {teamId != null && tab === "sprint" && sprints.length > 0 && (
          <SearchableDropdown
            items={sprintItems}
            value={selectedSprintId != null ? String(selectedSprintId) : ""}
            onChange={(v) => setSprintId(v ? parseInt(v, 10) : null)}
            placeholder="Search sprints…"
            allLabel="Sprint"
            hideAllOption
            triggerIcon={<IconRun size={14} style={{ opacity: 0.5, flexShrink: 0 }} />}
            width={300}
          />
        )}

        {/* Beside the picker: it opens the picked sprint. */}
        {teamId != null && tab === "sprint" && boardUrl && (
          <a
            href={boardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="d-inline-flex align-items-center gap-1 px-1"
            style={{ fontSize: "0.8125rem" }}
          >
            Open in JIRA
            <IconExternalLink size={13} stroke={1.5} style={{ opacity: 0.6 }} />
          </a>
        )}

        {/* Refresh and the tabs at the far right, so neither moves when the
            tab (and the controls on the left) changes. Refresh reloads the
            active tab. */}
        {teamId != null && (
          <div className="ms-auto d-flex align-items-center gap-2">
            <button
              type="button"
              className="pr-table-collapse-btn pr-toolbar-btn"
              onClick={refreshActive}
              disabled={activeLoading}
              title={refreshTitle}
              aria-label={refreshLabel}
            >
              <IconRefresh size={14} className={activeLoading ? "spin" : ""} />
            </button>
            <SegmentedTabs
              className="inline-control"
              activeKey={tab}
              onChange={(k) => setTab(k as (typeof TEAM_TABS)[number])}
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
          </div>
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
        <div className={tab === "sprint" ? "team-dashboard-sprint" : "d-none"}>
          {!dashboard && loading && <TeamDashboardSkeleton />}
          {dashboard && (
            <>
              {otherErrors.length > 0 && (
                <div className="alert alert-warning small">
                  <ul className="mb-0 ps-3">
                    {otherErrors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Without Jira the sprint panels would render empty data as if it
                  were real ("No active sprint", WIP 0, everyone "normal"), so
                  replace them with the error and a retry. */}
              {jiraError ? (
                <div className="border rounded mb-3">
                  <EmptyState
                    icon={<IconAlertTriangle size={32} />}
                    title="Couldn't load sprint data from Jira"
                    description={jiraError}
                    action={
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 mt-2"
                        onClick={refresh}
                        disabled={loading}
                      >
                        <IconRefresh size={14} /> Retry
                      </button>
                    }
                  />
                </div>
              ) : (
                <>
                  {/* Sprint meta */}
                  <SprintMetaBar sprint={selectedSprint} pace={dashboard.pace} />

                  <div className="mb-3">
                    <EpicCards epics={dashboard.epics} onOpenRef={openRef} />
                  </div>

                  <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
                    <SegmentedTabs
                      className="inline-control"
                      activeKey={sprintView}
                      onChange={(k) => setSprintView(k as (typeof SPRINT_VIEWS)[number])}
                      tabs={[
                        {
                          key: "overview",
                          label: (
                            <span className="d-inline-flex align-items-center gap-1">
                              <IconLayoutDashboard size={14} /> Sprint overview
                            </span>
                          ),
                        },
                        {
                          key: "people",
                          label: (
                            <span className="d-inline-flex align-items-center gap-1">
                              <IconUsers size={14} /> People
                            </span>
                          ),
                        },
                      ]}
                    />
                    {sprintView === "people" && (
                      <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                        ↑ ↓ in the list steps through people
                      </span>
                    )}
                  </div>
                </>
              )}

              {/* People fills this area rather than scrolling in it, so its
                  frame stays whole; its list and detail scroll inside. */}
              <div
                className={`team-dashboard-sprint__scroll${!jiraError && sprintView === "people" ? " team-dashboard-sprint__scroll--fill" : ""}`}
              >
                {!jiraError && sprintView === "people" && (
                  <PeopleView
                    workload={dashboard.workload}
                    issues={dashboard.issues}
                    selectedId={personId}
                    onSelect={setPersonId}
                    onOpenRef={openRef}
                  />
                )}

                {/* Three independent columns, so expanding a hygiene row
                        only grows its own column. Kept mounted while People
                        shows, so expanded rows survive the round trip. */}
                {!jiraError && (
                  <div className={`row g-3 mb-3${sprintView === "overview" ? "" : " d-none"}`}>
                    <div className="col-lg-6">
                      <LoadDistribution
                        workload={dashboard.workload}
                        loadBalance={dashboard.loadBalance}
                        onOpenRef={openRef}
                        onSelectMember={(accountId) => {
                          setPersonId(accountId);
                          setSprintView("people");
                        }}
                        staleDays={staleDaysMap}
                      />
                      <div className="mt-3"></div>
                      <DeliveryHygiene
                        hygiene={dashboard.hygiene}
                        lookup={refLookup}
                        onOpenRef={openRef}
                      />
                    </div>
                    <div className="col-lg-6">
                      <NeedsAttentionPanel
                        needsAttention={dashboard.needsAttention}
                        lookup={refLookup}
                        onOpenRef={openRef}
                      />
                      <div className="mt-3"></div>
                      <ReviewQueuePanel
                        entries={dashboard.reviewQueue}
                        members={dashboard.workload.map((w) => ({
                          login: w.githubUsername,
                          name: w.displayName,
                        }))}
                        onOpenPR={openPR}
                      />
                    </div>
                  </div>
                )}
                {/* Off-board PRs — full list. Team-wide, so not on People. */}
                <div
                  className={`border rounded p-2${!jiraError && sprintView === "people" ? " d-none" : ""}`}
                  style={{ background: "rgba(255,170,60,.06)" }}
                >
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
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- PRs tab: Org PRs, authors locked to the team ---- */}
      {teamId != null && prsEverOpened && (
        <div className={tab === "prs" ? "team-dashboard-prs" : "d-none"}>
          <TeamPRsTab
            ref={prsTabRef}
            onLoadingChange={setPrsLoading}
            active={tab === "prs"}
            configured={configured}
            teamId={teamId}
            teamName={teamName}
            jiraBaseUrl={jiraBaseUrl}
            jiraIssues={jiraIssues}
          />
        </div>
      )}

      <LoadingOverlay show={detailLoading} label="Loading…" />

      <JiraIssueDrawer
        issue={drawerIssue}
        show={!!drawerIssue}
        onHide={() => {
          setDrawerIssue(null);
          setDrawerLoadingKey(null);
        }}
        baseUrl={jiraBaseUrl}
        linkedPRs={drawerPRs}
        staleDays={drawerStaleDays}
        onReload={reloadIssue}
        reloading={drawerReloading}
        loadingKey={drawerLoadingKey}
      />

      <PRDetailModal pr={modalPR} onHide={() => setModalPR(null)} jiraBaseUrl={jiraBaseUrl} />
    </div>
  );
}
