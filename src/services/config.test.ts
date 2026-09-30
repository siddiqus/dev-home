import { beforeEach, describe, expect, it } from "vitest";
import { apiClient, credentialHeaders, isConfigured, loadSettings, saveSettings } from "./config";

const full = {
  jiraBaseUrl: "https://acme.atlassian.net",
  jiraEmail: "me@acme.com",
  jiraApiToken: "jt",
  githubToken: "gt",
  githubUsername: "me",
  githubOrg: "",
  hiddenTabs: ["board"],
};

describe("browser settings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults when nothing stored and round-trips", () => {
    expect(loadSettings()).toEqual({
      jiraBaseUrl: "",
      jiraEmail: "",
      jiraApiToken: "",
      githubToken: "",
      githubUsername: "",
      githubOrg: "",
      hiddenTabs: [],
    });
    saveSettings(full);
    expect(loadSettings()).toEqual(full);
    expect(isConfigured(full)).toBe(true);
    expect(isConfigured({ ...full, githubToken: "" })).toBe(false);
  });

  it("builds credential headers, omitting empty org", () => {
    expect(credentialHeaders(full)).toEqual({
      "x-jira-base-url": "https://acme.atlassian.net",
      "x-jira-email": "me@acme.com",
      "x-jira-api-token": "jt",
      "x-github-token": "gt",
      "x-github-username": "me",
    });
  });

  it("apiClient attaches headers from current settings", async () => {
    saveSettings(full);
    let captured: Record<string, unknown> = {};
    await apiClient.get("/health", {
      adapter: async (cfg) => {
        captured = Object.fromEntries(Object.entries(cfg.headers ?? {}));
        return { data: {}, status: 200, statusText: "OK", headers: {}, config: cfg };
      },
    });
    expect(captured["x-github-token"]).toBe("gt");
  });

  it("guards hiddenTabs with Array.isArray for bad stored data", () => {
    localStorage.setItem("dev-home-settings", JSON.stringify({ hiddenTabs: "not-an-array" }));
    const settings = loadSettings();
    expect(Array.isArray(settings.hiddenTabs)).toBe(true);
    expect(settings.hiddenTabs).toEqual([]);
  });
});
