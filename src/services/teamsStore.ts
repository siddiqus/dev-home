/**
 * The local team tables, on their own so the app shell can read team names
 * (the sidebar's recent teams) without pulling in services/teams and the
 * cockpit code it imports, which load with the team views.
 */
import { createCollection } from "../lib/localStore";
import type { Team, TeamMember } from "../types/teams";

// Stored rows keep created_at/updated_at timestamps
export interface TeamRow extends Team {
  created_at: string;
  updated_at: string;
}

export interface TeamMemberRow extends TeamMember {
  created_at: string;
}

export const teamsCollection = createCollection<TeamRow>("teams");
export const teamMembersCollection = createCollection<TeamMemberRow>("team_members");

/** Every stored team's id and name, read straight from local storage. */
export function readTeamNames(): { id: number; name: string }[] {
  return teamsCollection.all().map((t) => ({ id: t.id, name: t.name }));
}
