import { describe, it, expect } from "vitest";
import { isTabVisible } from "./navTabs";

const ctx = { hiddenTabs: [] as string[], githubOrg: "acme" };

describe("isTabVisible", () => {
  it("rejects unknown keys, such as a stale saved tab", () => {
    expect(isTabVisible("jira-tasks", ctx)).toBe(false);
  });

  it("allows routable non-sidebar tabs", () => {
    expect(isTabVisible("settings", ctx)).toBe(true);
    expect(isTabVisible("team-dashboard", ctx)).toBe(true);
  });

  it("hides tabs hidden in settings", () => {
    expect(isTabVisible("board", { ...ctx, hiddenTabs: ["board"] })).toBe(false);
  });

  it("requires a GitHub org for org-scoped tabs", () => {
    for (const key of ["org-prs", "teams", "team-dashboard"]) {
      expect(isTabVisible(key, { ...ctx, githubOrg: "" })).toBe(false);
    }
    expect(isTabVisible("prs", { ...ctx, githubOrg: "" })).toBe(true);
  });
});
