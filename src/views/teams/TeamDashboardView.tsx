import { useState, useRef } from "react";
import { IconChartBar } from "@tabler/icons-react";
import { useTeams } from "../../hooks/useTeams";
import { useTeamDashboard } from "../../hooks/useTeamDashboard";
import { WorkloadBars } from "./WorkloadBars";
import { SprintIssueTable } from "./SprintIssueTable";
import { ReadOnlyBoard } from "./ReadOnlyBoard";
import { EmptyState } from "../../components/EmptyState";

interface Props {
  jiraBaseUrl?: string;
}

export function TeamDashboardView({ jiraBaseUrl }: Props) {
  const { teams } = useTeams(true);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [sprintId, setSprintId] = useState<number | null>(null);
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board">("list");
  const offBoardRef = useRef<HTMLDivElement | null>(null);

  const { dashboard, loading, error } = useTeamDashboard(teamId, sprintId);

  const filteredIssues =
    dashboard && memberFilter
      ? dashboard.issues.filter((i) => i.assigneeAccountId === memberFilter)
      : dashboard?.issues || [];

  return (
    <div className="p-3">
      <div className="d-flex gap-2 mb-3 align-items-center flex-wrap">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 220 }}
          value={teamId ?? ""}
          onChange={(e) => {
            setTeamId(e.target.value ? parseInt(e.target.value, 10) : null);
            setSprintId(null);
            setMemberFilter(null);
          }}
        >
          <option value="">Select a team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {dashboard && dashboard.sprints.length > 0 && (
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 240 }}
            value={sprintId ?? dashboard.sprint?.id ?? ""}
            onChange={(e) => setSprintId(e.target.value ? parseInt(e.target.value, 10) : null)}
          >
            {dashboard.sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.state})
              </option>
            ))}
          </select>
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
                  style={{ flex: "1 1 160px", fontSize: "0.8125rem" }}
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
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="small text-muted">SPRINT ISSUES · {filteredIssues.length}</div>
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
            {view === "list" ? (
              <SprintIssueTable issues={filteredIssues} jiraBaseUrl={jiraBaseUrl} />
            ) : (
              <ReadOnlyBoard issues={filteredIssues} jiraBaseUrl={jiraBaseUrl} />
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
              <table className="table table-sm mb-0">
                <tbody>
                  {dashboard.offBoardPRs.map((pr) => (
                    <tr key={`${pr.repo_full_name}#${pr.number}`}>
                      <td>{pr.author}</td>
                      <td>
                        <a href={pr.html_url} target="_blank" rel="noreferrer">
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
    </div>
  );
}
