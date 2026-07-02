import { useState } from "react";
import Table from "react-bootstrap/Table";
import { IconUsersGroup, IconPlus, IconTrash, IconPencil, IconChartBar } from "@tabler/icons-react";
import { useTeams } from "../../hooks/useTeams";
import { deleteTeam } from "../../services/teams";
import { TeamModal } from "./TeamModal";
import { EmptyState } from "../../components/EmptyState";
import type { Team } from "../../types/teams";

interface Props {
  /** True once backend config (and thus the resolved API port) is ready. */
  configured: boolean;
  /** Navigate to the team dashboard, pre-selecting the given team. */
  onOpenDashboard?: (teamId: number) => void;
}

export function TeamsView({ configured, onOpenDashboard }: Props) {
  const { teams, loading, error, refresh } = useTeams(configured);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (team: Team) => {
    setEditing(team);
    setModalOpen(true);
  };

  const handleDelete = async (team: Team) => {
    if (
      !window.confirm(
        `Delete team "${team.name}"? This also removes its members. This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await deleteTeam(team.id);
      refresh();
    } catch (e: any) {
      setActionError(e?.message || "Failed to delete team");
      console.error(e);
    }
  };

  const showEmpty = !loading && teams.length === 0;

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">Teams</h5>
        <button
          className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
          onClick={openCreate}
        >
          <IconPlus size={15} /> Create team
        </button>
      </div>

      {error && <div className="alert alert-danger small">{error}</div>}
      {actionError && <div className="alert alert-danger small">{actionError}</div>}

      {showEmpty ? (
        <EmptyState
          icon={<IconUsersGroup size={32} />}
          title="No teams yet"
          description="Create a team to get started."
        />
      ) : (
        <Table hover className="align-middle">
          <thead>
            <tr>
              <th>Name</th>
              <th>Jira board</th>
              <th style={{ width: 120 }}>Members</th>
              <th style={{ width: 1 }} />
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} onClick={() => openEdit(t)} style={{ cursor: "pointer" }}>
                <td style={{ fontWeight: 500 }}>{t.name}</td>
                <td>{t.jira_board_name || <span className="text-secondary-custom">—</span>}</td>
                <td>{t.member_count ?? 0}</td>
                <td>
                  <div
                    className="d-flex gap-2 justify-content-end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
                      onClick={() => onOpenDashboard?.(t.id)}
                    >
                      <IconChartBar size={13} /> Dashboard
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                      onClick={() => openEdit(t)}
                    >
                      <IconPencil size={13} /> Edit
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                      onClick={() => handleDelete(t)}
                    >
                      <IconTrash size={13} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <TeamModal
        team={editing}
        show={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={refresh}
      />
    </div>
  );
}
