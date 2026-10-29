import { createCollection, sqliteNow } from "../lib/localStore";
import { searchUsers, searchBoards } from "../api/jira";
import { postTeamDashboard } from "../api/teams/dashboard";
import { loadSettings } from "./config";
import { readDashboardCache, writeDashboardCache } from "./teamDashboardCache";
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

// --- Export / import ---
// Teams travel by name and members by Jira account, so local ids never leave
// the machine and an import merges cleanly into an existing setup.

export interface TeamsExport {
  kind: "dev-home-teams";
  version: 1;
  exportedAt?: string;
  teams: Array<{
    name: string;
    jiraBoardId?: number | null;
    jiraBoardName?: string | null;
    members: Array<{
      displayName: string;
      jiraAccountId: string;
      jiraEmail?: string | null;
      githubUsername: string;
    }>;
  }>;
}

export function exportTeams(): TeamsExport {
  const members = teamMembersCollection.all();
  const teams = [...teamsCollection.all()]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((t) => ({
      name: t.name,
      jiraBoardId: t.jira_board_id,
      jiraBoardName: t.jira_board_name,
      members: members
        .filter((m) => m.team_id === t.id)
        .sort((a, b) =>
          a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }),
        )
        .map((m) => ({
          displayName: m.display_name,
          jiraAccountId: m.jira_account_id,
          jiraEmail: m.jira_email,
          githubUsername: m.github_username,
        })),
    }));
  return { kind: "dev-home-teams", version: 1, exportedAt: new Date().toISOString(), teams };
}

function parseTeamsExport(data: unknown): TeamsExport["teams"] {
  const d = data as Partial<TeamsExport> | null;
  if (!d || d.kind !== "dev-home-teams" || !Array.isArray(d.teams)) {
    throw new Error("Not a teams export file");
  }
  return d.teams.map((t, i) => {
    const name = typeof t?.name === "string" ? t.name.trim() : "";
    if (!name) throw new Error(`Team #${i + 1} has no name`);
    const members = Array.isArray(t.members) ? t.members : [];
    for (const m of members) {
      if (!m?.displayName || !m.jiraAccountId || !m.githubUsername) {
        throw new Error(`Team "${name}" has a member missing a name, Jira account or GitHub user`);
      }
    }
    return { ...t, name, members };
  });
}

/**
 * Merge an export into local teams. Same-named teams (case-insensitive) gain
 * any members they're missing and take the file's board if it has one; other
 * teams are created. Nothing is removed. Validates the whole file first.
 */
export function importTeams(data: unknown): {
  created: number;
  updated: number;
  membersAdded: number;
} {
  const incoming = parseTeamsExport(data);
  const now = sqliteNow();
  let created = 0;
  let updated = 0;
  let membersAdded = 0;
  for (const t of incoming) {
    const existing = teamsCollection
      .all()
      .find((x) => x.name.toLowerCase() === t.name.toLowerCase());
    let teamId: number;
    if (existing) {
      teamId = existing.id;
      if (t.jiraBoardId != null) {
        teamsCollection.update(existing.id, {
          jira_board_id: t.jiraBoardId,
          jira_board_name: t.jiraBoardName ?? null,
          updated_at: now,
        });
      }
      updated++;
    } else {
      teamId = teamsCollection.insert({
        name: t.name,
        jira_board_id: t.jiraBoardId ?? null,
        jira_board_name: t.jiraBoardName ?? null,
        created_at: now,
        updated_at: now,
      }).id;
      created++;
    }
    const have = new Set(
      teamMembersCollection
        .all()
        .filter((m) => m.team_id === teamId)
        .map((m) => m.jira_account_id),
    );
    for (const m of t.members) {
      if (have.has(m.jiraAccountId)) continue;
      have.add(m.jiraAccountId);
      teamMembersCollection.insert({
        team_id: teamId,
        display_name: m.displayName,
        jira_account_id: m.jiraAccountId,
        jira_email: m.jiraEmail ?? null,
        github_username: m.githubUsername,
        created_at: now,
      });
      membersAdded++;
    }
  }
  return { created, updated, membersAdded };
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

  return postTeamDashboard({
    team: {
      id: team.id,
      name: team.name,
      jira_board_id: team.jira_board_id,
      jira_board_name: team.jira_board_name,
    },
    members: roster,
    sprintId: sprintId ?? null,
    ...(opts.force ? { force: true } : {}),
  }) as Promise<TeamDashboard>;
}

/**
 * What a team's dashboard depends on besides the sprint: its board and roster,
 * and the Jira site / GitHub org. Null when the team no longer exists.
 */
function dashboardSignature(teamId: number): string | null {
  const team = teamsCollection.get(teamId);
  if (!team) return null;
  const roster = teamMembersCollection
    .all()
    .filter((m) => m.team_id === teamId)
    .map((m) => `${m.jira_account_id}|${m.github_username}`)
    .sort();
  const { jiraBaseUrl, githubOrg } = loadSettings();
  return JSON.stringify([team.jira_board_id, roster, jiraBaseUrl, githubOrg]);
}

/** The dashboard last loaded for this team + sprint, unless the team or settings changed since. */
export function readCachedTeamDashboard(
  teamId: number,
  sprintId: number | null,
): TeamDashboard | null {
  const signature = dashboardSignature(teamId);
  return signature ? readDashboardCache(teamId, sprintId, signature) : null;
}

/** Keep a loaded dashboard until the next manual refresh. Partial failures aren't kept. */
export function cacheTeamDashboard(
  teamId: number,
  sprintId: number | null,
  dashboard: TeamDashboard,
): void {
  if (dashboard.errors.length > 0) return;
  const signature = dashboardSignature(teamId);
  if (signature) writeDashboardCache(teamId, sprintId, signature, dashboard);
}
