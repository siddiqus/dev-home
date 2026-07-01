import { useState } from "react";
import { IconUsersGroup } from "@tabler/icons-react";
import { useTeams } from "../../hooks/useTeams";
import { createTeam, deleteTeam } from "../../services/teams";
import { TeamEditor } from "./TeamEditor";
import { EmptyState } from "../../components/EmptyState";
import type { Team } from "../../types/teams";

export function TeamsView() {
  const { teams, loading, error, refresh } = useTeams(true);
  const [editing, setEditing] = useState<Team | null>(null);
  const [newName, setNewName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setActionError(null);
    try {
      const team = await createTeam({ name: newName.trim() });
      setNewName("");
      refresh();
      setEditing(team);
    } catch (e: any) {
      setActionError(e?.message || "Action failed");
      console.error(e);
    }
  };

  return (
    <div className="p-3">
      <h5 className="mb-3">Teams</h5>
      {error && <div className="alert alert-danger small">{error}</div>}
      {actionError && <div className="alert alert-danger small">{actionError}</div>}

      <div className="d-flex gap-2 mb-3" style={{ maxWidth: 420 }}>
        <input
          className="form-control form-control-sm"
          placeholder="New team name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button className="btn btn-sm btn-primary" onClick={handleCreate}>
          Create
        </button>
      </div>

      {editing && (
        <TeamEditor team={editing} onClose={() => setEditing(null)} onChanged={refresh} />
      )}

      {!loading && teams.length === 0 && !editing && (
        <EmptyState
          icon={<IconUsersGroup size={32} />}
          title="No teams yet"
          description="Create a team to get started."
        />
      )}

      {teams.map((t) => (
        <div
          key={t.id}
          className="d-flex justify-content-between align-items-center border-bottom py-2"
        >
          <span>
            {t.name}{" "}
            <span className="text-muted small">
              · {t.member_count ?? 0} members
              {t.jira_board_name ? ` · ${t.jira_board_name}` : ""}
            </span>
          </span>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(t)}>
              Edit
            </button>
            <button
              className="btn btn-sm btn-outline-danger"
              onClick={async () => {
                setActionError(null);
                try {
                  await deleteTeam(t.id);
                  refresh();
                } catch (e: any) {
                  setActionError(e?.message || "Action failed");
                  console.error(e);
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
