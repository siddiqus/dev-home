import { beforeEach, describe, expect, it } from "vitest";
import { createTeam, deleteTeam } from "./teams";
import { readTeamNames } from "./teamsStore";

beforeEach(() => localStorage.clear());

describe("readTeamNames", () => {
  it("reads the stored teams' ids and names", async () => {
    const a = await createTeam({ name: "Platform" });
    const b = await createTeam({ name: "CMP Core" });
    expect(readTeamNames()).toEqual([
      { id: a.id, name: "Platform" },
      { id: b.id, name: "CMP Core" },
    ]);
  });

  it("no longer lists a deleted team", async () => {
    const a = await createTeam({ name: "Platform" });
    await deleteTeam(a.id);
    expect(readTeamNames()).toEqual([]);
  });
});
