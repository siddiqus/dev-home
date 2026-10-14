import { useRef, useState } from "react";
import Table from "react-bootstrap/Table";
import {
  IconUsersGroup,
  IconPlus,
  IconTrash,
  IconPencil,
  IconChartBar,
  IconDownload,
  IconUpload,
} from "@tabler/icons-react";
import { useTeams } from "../../hooks/useTeams";
import { deleteTeam, exportTeams, importTeams } from "../../services/teams";
import { TeamModal } from "./TeamModal";
import { EmptyState } from "../../components/EmptyState";
import { Toast, useToast } from "../../components/Toast";
import { downloadTextFile } from "../../utils/tsvExport";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast(3000);

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

  const handleExport = () => {
    const data = exportTeams();
    downloadTextFile(
      `dev-home-teams-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(data, null, 2),
      "application/json",
    );
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    setActionError(null);
    try {
      const { created, updated, membersAdded } = importTeams(JSON.parse(await file.text()));
      refresh();
      const parts = [
        created && `${created} team${created === 1 ? "" : "s"} added`,
        updated && `${updated} updated`,
        `${membersAdded} member${membersAdded === 1 ? "" : "s"} added`,
      ].filter(Boolean);
      toast.show(`Imported: ${parts.join(" · ")}`);
    } catch (err: any) {
      setActionError(
        err instanceof SyntaxError ? "That file isn't valid JSON" : err?.message || "Import failed",
      );
    }
  };

  const showEmpty = !loading && teams.length === 0;

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">Teams</h5>
        <div className="d-flex align-items-center gap-1">
          {/* Import / export stay low-key next to the primary action. */}
          <button
            className="btn btn-sm btn-link text-secondary text-decoration-none d-inline-flex align-items-center gap-1"
            onClick={() => fileInputRef.current?.click()}
            title="Import teams from a JSON file (merges by team name)"
          >
            <IconUpload size={14} /> Import
          </button>
          <button
            className="btn btn-sm btn-link text-secondary text-decoration-none d-inline-flex align-items-center gap-1 me-1"
            onClick={handleExport}
            disabled={teams.length === 0}
            title="Export all teams and members as JSON"
          >
            <IconDownload size={14} /> Export
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="d-none"
            onChange={handleImportFile}
          />
          <button
            className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
            onClick={openCreate}
          >
            <IconPlus size={15} /> Create team
          </button>
        </div>
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
        <Table className="align-middle">
          <thead>
            <tr>
              <th style={{ width: 220 }}>Name</th>
              <th style={{ width: 200 }}>Jira board</th>
              <th style={{ width: 250 }}>Members</th>
              <th style={{ width: 280 }} />
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td style={{ fontWeight: 500 }}>{t.name}</td>
                <td>{t.jira_board_name || <span className="text-secondary-custom">—</span>}</td>
                <td>
                  {t.members && t.members.length > 0 ? (
                    t.members.map((m) => m.name).join(", ")
                  ) : (
                    <span className="text-secondary-custom">—</span>
                  )}
                </td>
                <td>
                  <div className="d-flex gap-2 justify-content-end">
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
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
