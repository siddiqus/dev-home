import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { IconChartBar, IconUsersGroup, IconRun } from "@tabler/icons-react";
import { useTeams } from "../../hooks/useTeams";
import { useTeamDashboard } from "../../hooks/useTeamDashboard";
import { WorkloadBars, SprintProgressBar } from "./WorkloadBars";
import { SprintIssueTable } from "./SprintIssueTable";
import { ReadOnlyBoard } from "./ReadOnlyBoard";
import { EmptyState } from "../../components/EmptyState";
import { SearchableDropdown, type DropdownItem } from "../../components/SearchableDropdown";
import { JiraIssueDrawer } from "../../components/JiraIssueDrawer";
import { DescriptionModal } from "../../components/DescriptionModal";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { fetchIssuesByKeys } from "../../services/jira";
import { fetchPR } from "../../services/github";
import { formatRelativeTime, formatShortDate } from "../../utils/time";
import type { JiraIssue, GitHubPR } from "../../types";
import type { LinkedPR } from "../../types/teams";

interface Props {
  /** True once backend config (and thus the resolved API port) is ready. */
  configured: boolean;
  jiraBaseUrl?: string;
  /** Pre-select this team when navigating in from the teams list. */
  initialTeamId?: number | null;
}

export function TeamDashboardView({ configured, jiraBaseUrl, initialTeamId }: Props) {
  const { teams } = useTeams(configured);
  const [teamId, setTeamId] = useState<number | null>(initialTeamId ?? null);
  const [sprintId, setSprintId] = useState<number | null>(null);
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board">("list");
  const offBoardRef = useRef<HTMLDivElement | null>(null);

  // This view stays mounted while the app only toggles the active tab, so a new
  // navigation target arrives as a prop change — reflect it (and reset the
  // dependent sprint/member filters) when it points at a different team.
  useEffect(() => {
    if (initialTeamId != null && initialTeamId !== teamId) {
      setTeamId(initialTeamId);
      setSprintId(null);
      setMemberFilter(null);
    }
  }, [initialTeamId]);

  const { dashboard, loading, error } = useTeamDashboard(teamId, sprintId);

  const filteredIssues =
    dashboard && memberFilter
      ? dashboard.issues.filter((i) => i.assigneeAccountId === memberFilter)
      : dashboard?.issues || [];

  const teamItems: DropdownItem[] = useMemo(
    () => teams.map((t) => ({ value: String(t.id), label: t.name })),
    [teams],
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

  // The sprint object currently on screen — used to show its start date.
  const selectedSprint =
    dashboard?.sprints.find((s) => s.id === selectedSprintId) ?? dashboard?.sprint ?? null;

  // --- Detail modals (Jira drawer + PR description modal) ---
  // Both dashboard views (table + board) and the off-board PR table share these
  // handlers; the modals are rendered once here at the dashboard level. Each
  // object only carries a reference (issue key / repo+number), so we fetch the
  // full record on click.
  const [drawerIssue, setDrawerIssue] = useState<JiraIssue | null>(null);
  const [drawerPRs, setDrawerPRs] = useState<LinkedPR[]>([]);
  const [modalPR, setModalPR] = useState<GitHubPR | null>(null);
  // A full-page overlay while a detail record is being fetched, so the click
  // gives immediate feedback before the drawer/modal can open.
  const [detailLoading, setDetailLoading] = useState(false);

  const openIssue = useCallback(
    (key: string) => {
      setDrawerIssue(null);
      // Linked PRs live on the dashboard row, not the fetched Jira issue.
      // Epics aren't in `issues`, so they resolve to an empty list.
      setDrawerPRs(dashboard?.issues.find((i) => i.key === key)?.linkedPRs ?? []);
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

  return (
    <div className="p-3">
      <div className="d-flex gap-2 mb-3 align-items-center flex-wrap">
        <SearchableDropdown
          items={teamItems}
          value={teamId != null ? String(teamId) : ""}
          onChange={(v) => {
            setTeamId(v ? parseInt(v, 10) : null);
            setSprintId(null);
            setMemberFilter(null);
          }}
          placeholder="Search teams…"
          allLabel="Select a team…"
          triggerIcon={<IconUsersGroup size={14} style={{ opacity: 0.5, flexShrink: 0 }} />}
          width={220}
        />

        {dashboard && dashboard.sprints.length > 0 && (
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
        )}

        {selectedSprint?.startDate && (
          <span className="small text-muted ms-auto">
            Started {formatShortDate(selectedSprint.startDate)}
          </span>
        )}
      </div>

      {error && <div className="alert alert-danger small">{error}</div>}
      {loading && <div className="text-muted small">Loading…</div>}
      {!teamId && !loading && (
        <EmptyState
          icon={<IconChartBar size={32} />}
          title="Select a team"
          description="Pick a team to see its dashboard."
        />
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

          {/* KPI strip (A+B) */}
          <div className="d-flex gap-2 mb-3">
            <div className="flex-fill border rounded p-2 text-center">
              <div className="h5 mb-0">{dashboard.counts.sprintIssues}</div>
              <div className="small text-muted">sprint issues</div>
            </div>
            <div className="flex-fill border rounded p-2 text-center">
              <div className="h5 mb-0">{dashboard.counts.epics}</div>
              <div className="small text-muted">epics</div>
            </div>
            <div
              className="flex-fill border rounded p-2 text-center"
              style={{ cursor: "pointer", background: "rgba(255,170,60,.12)" }}
              onClick={() => offBoardRef.current?.scrollIntoView({ behavior: "smooth" })}
              title="Jump to off-board PRs"
            >
              <div className="h5 mb-0">{dashboard.counts.offBoardPRs}</div>
              <div className="small text-muted">off-board PRs</div>
            </div>
          </div>

          {/* Epics */}
          <div className="border rounded p-2 mb-3">
            <div className="small text-muted mb-2">EPICS · {dashboard.epics.length}</div>
            <div className="d-flex gap-2 flex-wrap">
              {dashboard.epics.map((ep) => (
                <div
                  key={ep.key ?? "none"}
                  className="border rounded p-2"
                  style={{
                    flex: "1 1 160px",
                    fontSize: "0.8125rem",
                    cursor: ep.key ? "pointer" : undefined,
                  }}
                  onClick={ep.key ? () => openIssue(ep.key!) : undefined}
                  title={ep.key ? `View ${ep.key}` : undefined}
                >
                  <div className="fw-semibold text-truncate">{ep.name}</div>
                  <div className="text-muted">
                    {ep.total} tickets · {ep.done} done
                  </div>
                  <div style={{ height: 5, background: "rgba(125,125,125,.2)", borderRadius: 3 }}>
                    <div
                      style={{
                        height: 5,
                        width: `${ep.total ? (ep.done / ep.total) * 100 : 0}%`,
                        background: "#50c878",
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workload */}
          <div className="mb-3">
            <WorkloadBars
              workload={dashboard.workload}
              onSelectMember={setMemberFilter}
              selectedAccountId={memberFilter}
            />
          </div>

          {/* Sprint issues */}
          <div className="border rounded p-2 mb-3">
            <div className="d-flex justify-content-between align-items-center gap-3 mb-2 flex-wrap">
              <div className="small text-muted">SPRINT ISSUES · {filteredIssues.length}</div>
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <SprintProgressBar progress={dashboard.progress} />
                <div className="btn-group btn-group-sm">
                  <button
                    className={`btn btn-outline-secondary ${view === "list" ? "active" : ""}`}
                    onClick={() => setView("list")}
                  >
                    List
                  </button>
                  <button
                    className={`btn btn-outline-secondary ${view === "board" ? "active" : ""}`}
                    onClick={() => setView("board")}
                  >
                    Board
                  </button>
                </div>
              </div>
            </div>
            {view === "list" ? (
              <SprintIssueTable
                issues={filteredIssues}
                jiraBaseUrl={jiraBaseUrl}
                onIssueClick={openIssue}
                onPRClick={openPR}
              />
            ) : (
              <ReadOnlyBoard
                issues={filteredIssues}
                jiraBaseUrl={jiraBaseUrl}
                onIssueClick={openIssue}
                onPRClick={openPR}
              />
            )}
          </div>

          {/* Off-board PRs */}
          <div
            ref={offBoardRef}
            className="border rounded p-2"
            style={{ background: "rgba(255,170,60,.06)" }}
          >
            <div className="small text-muted mb-2">
              ⚠ PRs OUTSIDE THE SPRINT · last 2 weeks · {dashboard.offBoardPRs.length}
            </div>
            {dashboard.offBoardPRs.length === 0 ? (
              <div className="text-muted small">None.</div>
            ) : (
              <table className="table table-sm table-hover mb-0">
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
            )}
          </div>
        </>
      )}

      <LoadingOverlay show={detailLoading} label="Loading…" />

      <JiraIssueDrawer
        issue={drawerIssue}
        show={!!drawerIssue}
        onHide={() => setDrawerIssue(null)}
        baseUrl={jiraBaseUrl}
        linkedPRs={drawerPRs}
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
