import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_CACHED_DASHBOARDS,
  readDashboardCache,
  writeDashboardCache,
} from "./teamDashboardCache";
import {
  addTeamMember,
  cacheTeamDashboard,
  createTeam,
  readCachedTeamDashboard,
  updateTeam,
} from "./teams";
import { saveSettings, loadSettings } from "./config";
import dashboardFixture from "../views/teams/__fixtures__/dashboardFixture";
import type { TeamDashboard } from "../types/teams";

vi.mock("../api/teams/dashboard", () => ({ postTeamDashboard: vi.fn() }));

const board = (name: string): TeamDashboard => ({
  ...dashboardFixture,
  team: { ...dashboardFixture.team, name },
});

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("dashboard cache storage", () => {
  it("returns what was written for the same team, sprint and signature", () => {
    writeDashboardCache(1, null, "sig", board("A"));
    expect(readDashboardCache(1, null, "sig")?.team.name).toBe("A");
    expect(readDashboardCache(1, 7, "sig")).toBeNull();
    expect(readDashboardCache(2, null, "sig")).toBeNull();
    expect(readDashboardCache(1, null, "other")).toBeNull();
  });

  it("keeps only the most recently used entries", () => {
    for (let id = 1; id <= MAX_CACHED_DASHBOARDS + 1; id++) {
      writeDashboardCache(id, null, "sig", board(`T${id}`));
    }
    expect(readDashboardCache(1, null, "sig")).toBeNull();
    expect(readDashboardCache(2, null, "sig")?.team.name).toBe("T2");
  });

  it("counts a read as a use when picking what to drop", () => {
    for (let id = 1; id <= MAX_CACHED_DASHBOARDS; id++) {
      writeDashboardCache(id, null, "sig", board(`T${id}`));
    }
    readDashboardCache(1, null, "sig");
    writeDashboardCache(99, null, "sig", board("new"));
    expect(readDashboardCache(1, null, "sig")).not.toBeNull();
    expect(readDashboardCache(2, null, "sig")).toBeNull();
  });

  it("drops older entries, then gives up quietly, when storage is full", () => {
    writeDashboardCache(1, null, "sig", board("old"));
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (value.includes('"big"')) throw new DOMException("full", "QuotaExceededError");
      realSet.call(this, key, value);
    });
    expect(() => writeDashboardCache(2, null, "sig", board("big"))).not.toThrow();
    expect(readDashboardCache(1, null, "sig")).toBeNull();
    expect(readDashboardCache(2, null, "sig")).toBeNull();
  });

  it("ignores a corrupt entry", () => {
    localStorage.setItem("dev-home-team-dashboard:1:active", "{not json");
    expect(readDashboardCache(1, null, "sig")).toBeNull();
  });
});

describe("team dashboard cache", () => {
  beforeEach(() => {
    saveSettings({ ...loadSettings(), jiraBaseUrl: "https://a.atlassian.net", githubOrg: "acme" });
  });

  async function teamWithMember() {
    const t = await createTeam({ name: "Origami", boardId: 2278, boardName: "Old board" });
    await addTeamMember(t.id, { displayName: "A", jiraAccountId: "a1", githubUsername: "alice" });
    return t;
  }

  it("serves the cached dashboard until the team changes", async () => {
    const t = await teamWithMember();
    cacheTeamDashboard(t.id, null, board("cached"));
    expect(readCachedTeamDashboard(t.id, null)?.team.name).toBe("cached");

    await updateTeam(t.id, { boardId: 5868, boardName: "Origami: Scrum" });
    expect(readCachedTeamDashboard(t.id, null)).toBeNull();
  });

  it("misses when the roster changes", async () => {
    const t = await teamWithMember();
    cacheTeamDashboard(t.id, null, board("cached"));
    await addTeamMember(t.id, { displayName: "B", jiraAccountId: "b1", githubUsername: "bob" });
    expect(readCachedTeamDashboard(t.id, null)).toBeNull();
  });

  it("misses when the Jira site changes", async () => {
    const t = await teamWithMember();
    cacheTeamDashboard(t.id, null, board("cached"));
    saveSettings({ ...loadSettings(), jiraBaseUrl: "https://b.atlassian.net" });
    expect(readCachedTeamDashboard(t.id, null)).toBeNull();
  });

  it("doesn't keep a dashboard that came back with errors", async () => {
    const t = await teamWithMember();
    cacheTeamDashboard(t.id, null, { ...board("partial"), errors: ["GitHub: 1 PR search failed"] });
    expect(readCachedTeamDashboard(t.id, null)).toBeNull();
  });

  it("misses for a team that no longer exists", () => {
    expect(readCachedTeamDashboard(404, null)).toBeNull();
  });
});
