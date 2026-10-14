import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  fetchTeamDashboard,
  fetchTeamMembers,
  fetchTeams,
  exportTeams,
  importTeams,
  removeTeamMember,
  updateTeam,
} from "./teams";

vi.mock("../api/teams/dashboard", () => ({
  postTeamDashboard: vi.fn(),
}));

describe("teams (localStorage)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("creates/updates/lists teams with member summary", async () => {
    const t = await createTeam({ name: " Zeta ", boardId: 5, boardName: "Board" });
    await createTeam({ name: "alpha" });
    await addTeamMember(t.id, { displayName: "bob", jiraAccountId: "j1", githubUsername: "b" });
    await addTeamMember(t.id, { displayName: "Alice", jiraAccountId: "j2", githubUsername: "a" });
    const teams = await fetchTeams();
    expect(teams.map((x) => x.name)).toEqual(["alpha", "Zeta"]);
    expect(teams[1]).toMatchObject({
      jira_board_id: 5,
      jira_board_name: "Board",
      member_count: 2,
      members: [{ name: "Alice" }, { name: "bob" }],
    });
    const u = await updateTeam(t.id, { boardId: null });
    expect(u).toMatchObject({ name: "Zeta", jira_board_id: null, jira_board_name: "Board" });
  });

  it("validates and cascades deletes", async () => {
    await expect(createTeam({ name: "" })).rejects.toThrow("name is required");
    const t = await createTeam({ name: "T" });
    await expect(
      addTeamMember(t.id, { displayName: "x", jiraAccountId: "", githubUsername: "g" }),
    ).rejects.toThrow();
    const m = await addTeamMember(t.id, {
      displayName: "x",
      jiraAccountId: "j",
      githubUsername: "g",
    });
    await removeTeamMember(t.id, m.id);
    expect(await fetchTeamMembers(t.id)).toEqual([]);
    await addTeamMember(t.id, { displayName: "y", jiraAccountId: "j", githubUsername: "g" });
    await deleteTeam(t.id);
    expect(await fetchTeams()).toEqual([]);
    expect(await fetchTeamMembers(t.id)).toEqual([]);
  });

  it("posts roster to the stateless dashboard", async () => {
    const { postTeamDashboard } = await import("../api/teams/dashboard");
    const t = await createTeam({ name: "T", boardId: 3, boardName: "B" });
    await addTeamMember(t.id, { displayName: "A", jiraAccountId: "j", githubUsername: "a" });
    vi.mocked(postTeamDashboard).mockResolvedValue({ sprint: { id: 11, state: "active" } } as any);
    const d = await fetchTeamDashboard(t.id, 11);
    expect(postTeamDashboard).toHaveBeenCalledWith({
      team: { id: t.id, name: "T", jira_board_id: 3, jira_board_name: "B" },
      members: [{ accountId: "j", displayName: "A", githubUsername: "a" }],
      sprintId: 11,
    });
    expect(d.sprint?.id).toBe(11);
  });

  describe("export / import", () => {
    async function seed() {
      const t = await createTeam({ name: "Platform", boardId: 7, boardName: "PLAT board" });
      await addTeamMember(t.id, {
        displayName: "Alice",
        jiraAccountId: "j-alice",
        jiraEmail: "a@x.io",
        githubUsername: "alice",
      });
      return t;
    }

    it("exports teams with their boards and members, without local ids", async () => {
      await seed();
      const data = exportTeams();
      expect(data).toMatchObject({ kind: "dev-home-teams", version: 1 });
      expect(data.teams).toEqual([
        {
          name: "Platform",
          jiraBoardId: 7,
          jiraBoardName: "PLAT board",
          members: [
            {
              displayName: "Alice",
              jiraAccountId: "j-alice",
              jiraEmail: "a@x.io",
              githubUsername: "alice",
            },
          ],
        },
      ]);
    });

    it("round-trips into an empty store", async () => {
      await seed();
      const data = exportTeams();
      localStorage.clear();
      expect(importTeams(data)).toEqual({ created: 1, updated: 0, membersAdded: 1 });
      const teams = await fetchTeams();
      expect(teams).toMatchObject([{ name: "Platform", jira_board_id: 7, member_count: 1 }]);
    });

    it("merges into a same-named team: adds missing members, keeps existing ones", async () => {
      const t = await seed();
      const result = importTeams({
        kind: "dev-home-teams",
        version: 1,
        teams: [
          {
            name: "platform",
            jiraBoardId: 9,
            jiraBoardName: "New board",
            members: [
              { displayName: "Alice", jiraAccountId: "j-alice", githubUsername: "alice" },
              { displayName: "Bob", jiraAccountId: "j-bob", githubUsername: "bob" },
            ],
          },
        ],
      });
      expect(result).toEqual({ created: 0, updated: 1, membersAdded: 1 });
      const members = await fetchTeamMembers(t.id);
      expect(members.map((m) => m.display_name)).toEqual(["Alice", "Bob"]);
      const [team] = await fetchTeams();
      expect(team).toMatchObject({
        name: "Platform",
        jira_board_id: 9,
        jira_board_name: "New board",
      });
    });

    it("keeps the existing board when the import has none", async () => {
      await seed();
      importTeams({
        kind: "dev-home-teams",
        version: 1,
        teams: [{ name: "Platform", members: [] }],
      });
      const [team] = await fetchTeams();
      expect(team.jira_board_id).toBe(7);
    });

    it("rejects files that aren't a teams export, without writing anything", async () => {
      expect(() => importTeams({ foo: 1 })).toThrow(/not a teams export/i);
      expect(() =>
        importTeams({
          kind: "dev-home-teams",
          version: 1,
          teams: [
            { name: "Ok", members: [] },
            {
              name: "Bad",
              members: [{ displayName: "x", jiraAccountId: "", githubUsername: "g" }],
            },
          ],
        }),
      ).toThrow(/Bad/);
      expect(await fetchTeams()).toEqual([]);
    });
  });
});
