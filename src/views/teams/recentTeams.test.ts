import { describe, expect, it } from "vitest";
import { visitRecentTeam, type RecentTeam } from "./recentTeams";

const ids = (list: RecentTeam[]) => list.map((t) => t.id);

describe("visitRecentTeam", () => {
  it("adds a newly visited team at the bottom", () => {
    const list = visitRecentTeam([{ id: 1, at: 100 }], 2, 200);
    expect(list).toEqual([
      { id: 1, at: 100 },
      { id: 2, at: 200 },
    ]);
  });

  it("keeps a revisited team in its place and updates when it was visited", () => {
    const start = [
      { id: 1, at: 100 },
      { id: 2, at: 200 },
      { id: 3, at: 300 },
    ];
    const list = visitRecentTeam(start, 1, 400);
    expect(list).toEqual([
      { id: 1, at: 400 },
      { id: 2, at: 200 },
      { id: 3, at: 300 },
    ]);
  });

  it("drops the team visited longest ago once five are listed", () => {
    // Team 1 sits first but was revisited last; team 3 is the oldest visit.
    const start = [
      { id: 1, at: 900 },
      { id: 2, at: 200 },
      { id: 3, at: 100 },
      { id: 4, at: 400 },
      { id: 5, at: 500 },
    ];
    expect(ids(visitRecentTeam(start, 6, 1000))).toEqual([1, 2, 4, 5, 6]);
  });

  it("does not drop anything when the visited team is already listed", () => {
    const start = [1, 2, 3, 4, 5].map((id) => ({ id, at: id * 100 }));
    expect(ids(visitRecentTeam(start, 1, 1000))).toEqual([1, 2, 3, 4, 5]);
  });
});
