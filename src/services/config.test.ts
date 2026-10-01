import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkBackendHealth, isConfigured, loadSettings, saveSettings } from "./config";

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

  it("guards hiddenTabs with Array.isArray for bad stored data", () => {
    localStorage.setItem("dev-home-settings", JSON.stringify({ hiddenTabs: "not-an-array" }));
    const settings = loadSettings();
    expect(Array.isArray(settings.hiddenTabs)).toBe(true);
    expect(settings.hiddenTabs).toEqual([]);
  });
});

describe("checkBackendHealth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports online when the Jira proxy health check answers ok", async () => {
    const fetchMock = vi.fn(async () => Response.json({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkBackendHealth()).toEqual({ online: true, version: "test" });
    expect(fetchMock).toHaveBeenCalledWith("/jira-proxy/health");
  });

  it("reports offline on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "Not found" }, { status: 404 })),
    );
    expect(await checkBackendHealth()).toEqual({ online: false, version: "test" });
  });

  it("reports offline when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await checkBackendHealth()).toEqual({ online: false, version: "test" });
  });
});
