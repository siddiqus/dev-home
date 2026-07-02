import { useState, useEffect, useMemo } from "react";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import { IconTrash } from "@tabler/icons-react";
import { MemberSearchRow } from "./MemberSearchRow";
import { SearchableDropdown, type DropdownItem } from "../../components/SearchableDropdown";
import {
  fetchTeamMembers,
  addTeamMember,
  removeTeamMember,
  createTeam,
  updateTeam,
  searchJiraBoards,
} from "../../services/teams";
import type { Team, TeamMember, JiraBoardResult } from "../../types/teams";

interface Props {
  /** null → create mode; a Team → edit mode. */
  team: Team | null;
  show: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function TeamModal({ team, show, onClose, onSaved }: Props) {
  const isEdit = !!team;

  const [name, setName] = useState("");
  const [boardId, setBoardId] = useState<number | null>(null);
  const [boardName, setBoardName] = useState<string | null>(null);
  const [boardResults, setBoardResults] = useState<JiraBoardResult[]>([]);

  const [members, setMembers] = useState<TeamMember[]>([]);
  // The team id we operate against. In create mode this stays null until the
  // first member is added, at which point we lazily create the team so members
  // (which require a team id) can be attached.
  const [workingId, setWorkingId] = useState<number | null>(team?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset all local state whenever the modal opens for a (different) team.
  useEffect(() => {
    if (!show) return;
    setName(team?.name ?? "");
    setBoardId(team?.jira_board_id ?? null);
    setBoardName(team?.jira_board_name ?? null);
    setBoardResults([]);
    setWorkingId(team?.id ?? null);
    setError(null);
    setSaving(false);
    if (team) {
      fetchTeamMembers(team.id)
        .then(setMembers)
        .catch(() => setMembers([]));
    } else {
      setMembers([]);
    }
  }, [show, team]);

  const searchBoards = async (q: string) => {
    if (q.trim().length < 2) return setBoardResults([]);
    try {
      setBoardResults(await searchJiraBoards(q));
    } catch {
      setBoardResults([]);
    }
  };

  const boardItems: DropdownItem[] = useMemo(() => {
    const items = boardResults.map((b) => ({
      value: String(b.id),
      label: b.projectKey ? `${b.name} · ${b.projectKey}` : b.name,
    }));
    // Keep the currently-selected board visible even when it isn't in the
    // latest search results.
    if (boardId != null && !items.some((i) => i.value === String(boardId))) {
      items.unshift({ value: String(boardId), label: boardName || String(boardId) });
    }
    return items;
  }, [boardResults, boardId, boardName]);

  /** Ensure a team row exists (create lazily) and return its id. */
  const ensureTeam = async (): Promise<number> => {
    if (workingId != null) return workingId;
    if (!name.trim()) throw new Error("Enter a team name first");
    const created = await createTeam({ name: name.trim(), boardId, boardName });
    setWorkingId(created.id);
    return created.id;
  };

  const handleAddMember = async (member: {
    displayName: string;
    jiraAccountId: string;
    jiraEmail: string | null;
    githubUsername: string;
  }) => {
    setError(null);
    try {
      const id = await ensureTeam();
      await addTeamMember(id, member);
      setMembers(await fetchTeamMembers(id));
    } catch (e: any) {
      setError(e?.message || "Failed to add member");
      console.error(e);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (workingId == null) return;
    setError(null);
    try {
      await removeTeamMember(workingId, memberId);
      setMembers(await fetchTeamMembers(workingId));
    } catch (e: any) {
      setError(e?.message || "Failed to remove member");
      console.error(e);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Team name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (workingId != null) {
        // Either edit mode, or create mode where members already forced a
        // lazy create — persist the current name/board.
        await updateTeam(workingId, { name: name.trim(), boardId, boardName });
      } else {
        await createTeam({ name: name.trim(), boardId, boardName });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to save team");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: "1rem" }}>{isEdit ? "Edit team" : "New team"}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {error && <div className="alert alert-danger small">{error}</div>}

        <label className="small text-muted mb-1">Name</label>
        <input
          className="form-control form-control-sm mb-3"
          placeholder="Team name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="small text-muted mb-1">Jira board (optional)</label>
        <div className="mb-3">
          <SearchableDropdown
            items={boardItems}
            value={boardId != null ? String(boardId) : ""}
            onChange={(v) => {
              if (!v) {
                setBoardId(null);
                setBoardName(null);
                return;
              }
              const found = boardResults.find((b) => String(b.id) === v);
              setBoardId(Number(v));
              setBoardName(found ? found.name : boardName);
            }}
            onSearchChange={searchBoards}
            placeholder="Search scrum boards…"
            allLabel="No board"
            width={320}
          />
        </div>

        <hr />

        <label className="small text-muted mb-2 d-block">Members</label>
        {members.length === 0 && <div className="text-muted small mb-2">No members yet.</div>}
        {members.map((m) => (
          <div key={m.id} className="d-flex justify-content-between align-items-center small py-1">
            <span>
              {m.display_name} · <code>{m.github_username}</code>
            </span>
            <button
              className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
              onClick={() => handleRemoveMember(m.id)}
            >
              <IconTrash size={13} /> Remove
            </button>
          </div>
        ))}

        <div className="mt-3">
          <MemberSearchRow onAdd={handleAddMember} />
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
