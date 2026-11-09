import { describe, it, expect } from "vitest";
import {
  expandAuthors,
  hasTeamPick,
  pickName,
  teamPicksLabel,
  teamSlugOf,
  teamValue,
} from "./authorPicks";

const teams = [
  { slug: "web", name: "CMP Frontend", members: ["abu", "rkhan"] },
  { slug: "core", name: "Platform", members: ["rkhan", "zed"] },
];

describe("authorPicks", () => {
  it("tells team picks from people", () => {
    expect(teamValue("web")).toBe("team:web");
    expect(teamSlugOf("team:web")).toBe("web");
    expect(teamSlugOf("abu")).toBeNull();
    expect(hasTeamPick(["abu", "team:web"])).toBe(true);
    expect(hasTeamPick(["abu"])).toBe(false);
  });

  it("expands teams to their members, dropping repeats in any case", () => {
    expect(expandAuthors(["Abu", "team:web", "team:core"], teams)).toEqual(["Abu", "rkhan", "zed"]);
  });

  it("adds no one for a team that isn't listed", () => {
    expect(expandAuthors(["team:gone", "abu"], teams)).toEqual(["abu"]);
    expect(expandAuthors(["team:web"], [])).toEqual([]);
  });

  it("names a team by its name, or its slug until teams load", () => {
    expect(pickName("team:web", teams)).toBe("CMP Frontend");
    expect(pickName("team:web", [])).toBe("web");
    expect(pickName("abu", teams)).toBe("abu");
  });

  it("labels picks with a team by the first team, plus how many more", () => {
    expect(teamPicksLabel(["team:web"], teams)).toBe("CMP Frontend");
    expect(teamPicksLabel(["abu", "team:core", "zed"], teams)).toBe("Platform + 2");
    expect(teamPicksLabel(["abu", "zed"], teams)).toBeNull();
  });
});
