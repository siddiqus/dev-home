import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  fetchTeamDashboard,
  fetchTeamMembers,
  fetchTeams,
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

  it("posts roster to the stateless dashboard and records the snapshot", async () => {
    const { postTeamDashboard } = await import("../api/teams/dashboard");
    const t = await createTeam({ name: "T", boardId: 3, boardName: "B" });
    await addTeamMember(t.id, { displayName: "A", jiraAccountId: "j", githubUsername: "a" });
    vi.mocked(postTeamDashboard).mockResolvedValue({
      burnup: { trackingSince: null, points: [] },
      snapshot: { sprintId: 11, date: "2026-09-30", doneCount: 2, totalCount: 8 },
    } as any);
    const d = await fetchTeamDashboard(t.id, 11);
    expect(postTeamDashboard).toHaveBeenCalledWith({
      team: { id: t.id, name: "T", jira_board_id: 3, jira_board_name: "B" },
      members: [{ accountId: "j", displayName: "A", githubUsername: "a" }],
      sprintId: 11,
    });
    expect(d.burnup.trackingSince).toBe("2026-09-30");
    expect(d.burnup.points).toHaveLength(1);
  });

  it("returns dashboard with burnup when recordSnapshot fails", async () => {
    const { postTeamDashboard } = await import("../api/teams/dashboard");
    const t = await createTeam({ name: "T", boardId: 3, boardName: "B" });
    await addTeamMember(t.id, { displayName: "A", jiraAccountId: "j", githubUsername: "a" });
    vi.mocked(postTeamDashboard).mockResolvedValue({
      burnup: { trackingSince: null, points: [] },
      snapshot: { sprintId: 11, date: "2026-09-30", doneCount: 2, totalCount: 8 },
    } as any);

    const orig = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === "dev-home:db:sprint_snapshots") {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      }
      return orig.call(this, key, value);
    });

    const d = await fetchTeamDashboard(t.id, 11);
    expect(d.burnup).toBeDefined();
    expect(Array.isArray(d.burnup.points)).toBe(true);

    spy.mockRestore();
  });
});
