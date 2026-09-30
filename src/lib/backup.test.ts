import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("rolls back on quota error, restoring original state exactly", () => {
    // Seed original data
    localStorage.setItem(DB_PREFIX + "old1", JSON.stringify({ old: 1 }));
    localStorage.setItem(DB_PREFIX + "old2", JSON.stringify({ old: 2 }));
    localStorage.setItem(SETTINGS, JSON.stringify({ githubToken: "tok" }));

    const orig = Storage.prototype.setItem;
    let callCount = 0;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      callCount++;
      // Throw on the second setItem call after restore starts (first new data key)
      if (callCount === 2) {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      }
      return orig.call(this, key, value);
    });

    expect(() =>
      restoreBackup({
        app: "dev-home",
        version: 1,
        exportedAt: "x",
        data: { new1: { a: 1 }, new2: { b: 2 } },
        settings: {},
      }),
    ).toThrow("QuotaExceededError");

    spy.mockRestore();

    // Original state should be restored exactly
    expect(localStorage.getItem(DB_PREFIX + "old1")).toBe(JSON.stringify({ old: 1 }));
    expect(localStorage.getItem(DB_PREFIX + "old2")).toBe(JSON.stringify({ old: 2 }));
    expect(localStorage.getItem(SETTINGS)).toBe(JSON.stringify({ githubToken: "tok" }));
    // No new keys from the backup
    expect(localStorage.getItem(DB_PREFIX + "new1")).toBeNull();
    expect(localStorage.getItem(DB_PREFIX + "new2")).toBeNull();
  });
});
