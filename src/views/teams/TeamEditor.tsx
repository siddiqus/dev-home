import { useState, useEffect } from "react";
import { MemberSearchRow } from "./MemberSearchRow";
import {
  fetchTeamMembers,
  addTeamMember,
  removeTeamMember,
  updateTeam,
  searchJiraBoards,
} from "../../services/teams";
import type { Team, TeamMember, JiraBoardResult } from "../../types/teams";

interface Props {
  team: Team;
  onClose: () => void;
  onChanged: () => void;
}

export function TeamEditor({ team, onClose, onChanged }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [name, setName] = useState(team.name);
  const [boardQuery, setBoardQuery] = useState(team.jira_board_name || "");
  const [boardResults, setBoardResults] = useState<JiraBoardResult[]>([]);
  const [boardId, setBoardId] = useState<number | null>(team.jira_board_id);
  const [boardName, setBoardName] = useState<string | null>(team.jira_board_name);

  const loadMembers = () => fetchTeamMembers(team.id).then(setMembers);
  useEffect(() => {
    loadMembers();
  }, [team.id]);

  const searchBoards = async (q: string) => {
    setBoardQuery(q);
    setBoardId(null);
    setBoardName(null);
    if (q.trim().length < 2) return setBoardResults([]);
    try {
      setBoardResults(await searchJiraBoards(q));
    } catch {
      setBoardResults([]);
    }
  };

  const saveMeta = async () => {
    await updateTeam(team.id, { name, boardId, boardName });
    onChanged();
  };

  return (
    <div className="card p-3 mb-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <input
          className="form-control form-control-sm"
          style={{ maxWidth: 260 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-primary" onClick={saveMeta}>
            Save
          </button>
          <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <label className="small text-muted">Jira board (optional)</label>
      <input
        className="form-control form-control-sm mb-1"
        placeholder="Search scrum boards…"
        value={boardId ? boardName || "" : boardQuery}
        onChange={(e) => searchBoards(e.target.value)}
      />
      {!boardId &&
        boardResults.map((b) => (
          <div
            key={b.id}
            className="p-1 small"
            style={{ cursor: "pointer" }}
            onClick={() => {
              setBoardId(b.id);
              setBoardName(b.name);
              setBoardResults([]);
            }}
          >
            {b.name} {b.projectKey ? `· ${b.projectKey}` : ""}
          </div>
        ))}

      <hr />
      <label className="small text-muted mb-1">Members</label>
      {members.map((m) => (
        <div key={m.id} className="d-flex justify-content-between align-items-center small py-1">
          <span>
            {m.display_name} · <code>{m.github_username}</code>
          </span>
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={async () => {
              await removeTeamMember(team.id, m.id);
              loadMembers();
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="mt-2">
        <MemberSearchRow
          onAdd={async (member) => {
            await addTeamMember(team.id, member);
            loadMembers();
          }}
        />
      </div>
    </div>
  );
}
