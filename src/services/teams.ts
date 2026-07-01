import { apiClient } from "./config";
import type {
  Team,
  TeamMember,
  JiraUserResult,
  JiraBoardResult,
  SprintResult,
  TeamDashboard,
} from "../types/teams";

export async function fetchTeams(): Promise<Team[]> {
  const { data } = await apiClient.get("/teams");
  return data.teams || [];
}

export async function createTeam(input: {
  name: string;
  boardId?: number | null;
  boardName?: string | null;
}): Promise<Team> {
  const { data } = await apiClient.post("/teams", input);
  return data.team;
}

export async function updateTeam(
  id: number,
  input: { name?: string; boardId?: number | null; boardName?: string | null },
): Promise<Team> {
  const { data } = await apiClient.put(`/teams/${id}`, input);
  return data.team;
}

export async function deleteTeam(id: number): Promise<void> {
  await apiClient.delete(`/teams/${id}`);
}

export async function fetchTeamMembers(teamId: number): Promise<TeamMember[]> {
  const { data } = await apiClient.get(`/teams/${teamId}/members`);
  return data.members || [];
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
  const { data } = await apiClient.post(`/teams/${teamId}/members`, input);
  return data.member;
}

export async function removeTeamMember(teamId: number, memberId: number): Promise<void> {
  await apiClient.delete(`/teams/${teamId}/members/${memberId}`);
}

export async function searchJiraUsers(q: string): Promise<JiraUserResult[]> {
  const { data } = await apiClient.get("/teams-jira/users/search", { params: { q } });
  return data.users || [];
}

export async function searchJiraBoards(q: string): Promise<JiraBoardResult[]> {
  const { data } = await apiClient.get("/teams-jira/boards/search", { params: { q } });
  return data.boards || [];
}

export async function fetchBoardSprints(boardId: number): Promise<SprintResult[]> {
  const { data } = await apiClient.get(`/teams-jira/boards/${boardId}/sprints`);
  return data.sprints || [];
}

export async function fetchTeamDashboard(
  teamId: number,
  sprintId?: number | null,
): Promise<TeamDashboard> {
  const { data } = await apiClient.get(`/teams/${teamId}/dashboard`, {
    params: sprintId ? { sprintId } : {},
  });
  return data;
}
