import { beforeEach, describe, expect, it } from "vitest";
import { createBackup, restoreBackup } from "./backup";
import { DB_PREFIX } from "./localStore";

const SETTINGS = "dev-home-settings";

describe("backup", () => {
  beforeEach(() => localStorage.clear());

  it("exports data keys and non-secret settings only", () => {
    localStorage.setItem(DB_PREFIX + "notes", JSON.stringify({ nextId: 2, rows: [{ id: 1 }] }));
    localStorage.setItem("dev-home-active-tab", "prs");
    localStorage.setItem(
      SETTINGS,
      JSON.stringify({
        githubUsername: "me",
        githubToken: "secret",
        jiraApiToken: "secret2",
        hiddenTabs: ["board"],
      }),
    );
    const b = createBackup(new Date("2026-09-30T00:00:00Z"));
    expect(b).toEqual({
      app: "dev-home",
      version: 1,
      exportedAt: "2026-09-30T00:00:00.000Z",
      data: { notes: { nextId: 2, rows: [{ id: 1 }] } },
      settings: { githubUsername: "me", hiddenTabs: ["board"] },
    });
    expect(JSON.stringify(b)).not.toContain("secret");
  });

  it("restores data, replaces old data keys and keeps tokens", () => {
    localStorage.setItem(DB_PREFIX + "stale", "1");
    localStorage.setItem(SETTINGS, JSON.stringify({ githubToken: "tok", githubUsername: "old" }));
    restoreBackup({
      app: "dev-home",
      version: 1,
      exportedAt: "x",
      data: { notes: { nextId: 1, rows: [] } },
      settings: { githubUsername: "new" },
    });
    expect(localStorage.getItem(DB_PREFIX + "stale")).toBeNull();
    expect(JSON.parse(localStorage.getItem(DB_PREFIX + "notes")!)).toEqual({ nextId: 1, rows: [] });
    expect(JSON.parse(localStorage.getItem(SETTINGS)!)).toEqual({
      githubToken: "tok",
      githubUsername: "new",
    });
  });

  it("rejects foreign files", () => {
    expect(() => restoreBackup({ foo: 1 })).toThrow("Not a Dev Home backup file");
    expect(() => restoreBackup(null)).toThrow("Not a Dev Home backup file");
  });
});
