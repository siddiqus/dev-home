import { createCollection, sqliteNow } from "../lib/localStore";
import { buildBurnup } from "../../shared/burnup";
import { getSnapshotRows, recordSnapshot } from "./snapshots";
import { searchUsers, searchBoards } from "../api/jira";
import { postTeamDashboard } from "../api/teams/dashboard";
import type {
  Team,
  TeamMember,
  JiraUserResult,
  JiraBoardResult,
  TeamDashboard,
} from "../types/teams";

// Stored rows keep created_at/updated_at timestamps
interface TeamRow extends Team {
  created_at: string;
  updated_at: string;
}

interface TeamMemberRow extends TeamMember {
  created_at: string;
}

export const teamsCollection = createCollection<TeamRow>("teams");
export const teamMembersCollection = createCollection<TeamMemberRow>("team_members");

export async function fetchTeams(): Promise<Team[]> {
  const teams = teamsCollection.all();
  const result: Team[] = teams.map((t) => {
    const members = teamMembersCollection
      .all()
      .filter((m) => m.team_id === t.id)
      .sort((a, b) =>
        a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }),
      );
    return {
      id: t.id,
      name: t.name,
      jira_board_id: t.jira_board_id,
      jira_board_name: t.jira_board_name,
      member_count: members.length,
      members: members.map((m) => ({ name: m.display_name })),
    };
  });
  return result.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export async function createTeam(input: {
  name: string;
  boardId?: number | null;
  boardName?: string | null;
}): Promise<Team> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("name is required");
  const now = sqliteNow();
  const row = teamsCollection.insert({
    name,
    jira_board_id: input.boardId ?? null,
    jira_board_name: input.boardName ?? null,
    created_at: now,
    updated_at: now,
  });
  return {
    id: row.id,
    name: row.name,
    jira_board_id: row.jira_board_id,
    jira_board_name: row.jira_board_name,
  };
}

export async function updateTeam(
  id: number,
  input: { name?: string; boardId?: number | null; boardName?: string | null },
): Promise<Team> {
  const existing = teamsCollection.get(id);
  if (!existing) throw new Error("team not found");
  const patch: Partial<Omit<TeamRow, "id">> = { updated_at: sqliteNow() };
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("name is required");
    patch.name = trimmed;
  }
  if (input.boardId !== undefined) patch.jira_board_id = input.boardId;
  if (input.boardName !== undefined) patch.jira_board_name = input.boardName;
  const updated = teamsCollection.update(id, patch)!;
  return {
    id: updated.id,
    name: updated.name,
    jira_board_id: updated.jira_board_id,
    jira_board_name: updated.jira_board_name,
  };
}

export async function deleteTeam(id: number): Promise<void> {
  teamMembersCollection.removeWhere((m) => m.team_id === id);
  teamsCollection.remove(id);
}

export async function fetchTeamMembers(teamId: number): Promise<TeamMember[]> {
  const members = teamMembersCollection
    .all()
    .filter((m) => m.team_id === teamId)
    .sort((a, b) =>
      a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }),
    );
  return members.map((m) => ({
    id: m.id,
    team_id: m.team_id,
    display_name: m.display_name,
    jira_account_id: m.jira_account_id,
    jira_email: m.jira_email,
    github_username: m.github_username,
  }));
}

export async function addTeamMember(
  teamId: number,
  input: {
    displayName: string;
    jiraAccountId: string;
    jiraEmail?: string | null;
    githubUsername: string;
  },
): Promise<TeamMember> {
  if (!input.displayName || !input.jiraAccountId || !input.githubUsername) {
    throw new Error("displayName, jiraAccountId, githubUsername are required");
  }
  const now = sqliteNow();
  const row = teamMembersCollection.insert({
    team_id: teamId,
    display_name: input.displayName,
    jira_account_id: input.jiraAccountId,
    jira_email: input.jiraEmail ?? null,
    github_username: input.githubUsername,
    created_at: now,
  });
  return {
    id: row.id,
    team_id: row.team_id,
    display_name: row.display_name,
    jira_account_id: row.jira_account_id,
    jira_email: row.jira_email,
    github_username: row.github_username,
  };
}

export async function removeTeamMember(teamId: number, memberId: number): Promise<void> {
  teamMembersCollection.removeWhere((m) => m.id === memberId && m.team_id === teamId);
}

export async function searchJiraUsers(q: string): Promise<JiraUserResult[]> {
  const { users } = await searchUsers({ q });
  return users || [];
}

export async function searchJiraBoards(q: string): Promise<JiraBoardResult[]> {
  const { boards } = await searchBoards({ q });
  return boards || [];
}

export async function fetchTeamDashboard(
  teamId: number,
  sprintId?: number | null,
  opts: { force?: boolean } = {},
): Promise<TeamDashboard> {
  const team = teamsCollection.get(teamId);
  if (!team) throw new Error("team not found");

  const members = teamMembersCollection.all().filter((m) => m.team_id === teamId);

  const roster = members.map((m) => ({
    accountId: m.jira_account_id,
    displayName: m.display_name,
    githubUsername: m.github_username,
  }));

  const data: any = await postTeamDashboard({
    team: {
      id: team.id,
      name: team.name,
      jira_board_id: team.jira_board_id,
      jira_board_name: team.jira_board_name,
    },
    members: roster,
    sprintId: sprintId ?? null,
    ...(opts.force ? { force: true } : {}),
  });

  // Record today's point (active sprint only) and build the burn-up history
  // for whichever sprint is shown from locally stored snapshots.
  if (data.snapshot) {
    try {
      recordSnapshot(data.snapshot);
    } catch (err) {
      console.warn("Failed to record snapshot:", err);
    }
  }
  if (data.sprint) data.burnup = buildBurnup(getSnapshotRows(data.sprint.id));

  return data;
}
