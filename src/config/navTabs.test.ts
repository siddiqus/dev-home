import { describe, it, expect } from "vitest";
import { effectiveTabFor, isTabVisible, NAV_GROUPS } from "./navTabs";
import { sourcesFor, PAGE_REFRESH } from "./tabData";

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

describe("workday tab", () => {
  it("sits right after Summary and is toggleable", () => {
    expect(NAV_GROUPS[0].tabs.map((t) => t.key).slice(0, 2)).toEqual(["summary", "workday"]);
    expect(isTabVisible("workday", ctx)).toBe(true);
    expect(isTabVisible("workday", { ...ctx, hiddenTabs: ["workday"] })).toBe(false);
  });

  it("loads the reused dashboard sources and has a page refresh", () => {
    expect(sourcesFor("workday", { boardEnabled: false })).toEqual([
      "openPRs",
      "reviewRequests",
      "jiraIssues",
      "jiraComments",
      "githubMentions",
      "notes",
    ]);
    expect(PAGE_REFRESH.workday.sources).toEqual([
      "openPRs",
      "reviewRequests",
      "jiraIssues",
      "jiraComments",
      "githubMentions",
    ]);
  });
});

describe("effectiveTabFor", () => {
  const ready = { ...ctx, configured: true, configLoading: false, phone: false };

  it("shows Settings until configured, on a phone too", () => {
    expect(effectiveTabFor("prs", { ...ready, configured: false })).toBe("settings");
    expect(effectiveTabFor("prs", { ...ready, configured: false, phone: true })).toBe("settings");
  });

  it("keeps a visible tab and falls back to Summary otherwise", () => {
    expect(effectiveTabFor("prs", ready)).toBe("prs");
    expect(effectiveTabFor("jira-tasks", ready)).toBe("summary");
    expect(effectiveTabFor("board", { ...ready, hiddenTabs: ["board"] })).toBe("summary");
  });

  it("lets a phone reach PR search (All PRs) when it's available", () => {
    const phone = { ...ready, phone: true, githubOrg: "acme" };
    expect(effectiveTabFor("org-prs", phone)).toBe("org-prs");
    // No org, or All PRs hidden: back to Workday.
    expect(effectiveTabFor("org-prs", { ...phone, githubOrg: "" })).toBe("workday");
    expect(effectiveTabFor("org-prs", { ...phone, hiddenTabs: ["org-prs"] })).toBe("workday");
  });

  it("shows only Workday on a phone, with Settings still reachable", () => {
    const phone = { ...ready, phone: true };
    expect(effectiveTabFor("prs", phone)).toBe("workday");
    expect(effectiveTabFor("summary", phone)).toBe("workday");
    expect(effectiveTabFor("settings", phone)).toBe("settings");
    // Hiding Workday from the sidebar doesn't leave a phone with nothing.
    expect(effectiveTabFor("prs", { ...phone, hiddenTabs: ["workday"] })).toBe("workday");
  });
});
