import { describe, expect, it } from "vitest";
import { CONFIG_HEADERS, configFromHeaders, getConfig, MissingConfigError, runWithConfig } from "./config";

const headers: Record<string, string> = {
  "x-jira-base-url": "https://acme.atlassian.net/",
  "x-jira-email": "me@acme.com",
  "x-jira-api-token": "jt",
  "x-github-token": "gt",
  "x-github-username": "me",
};
const get = (h: Record<string, string>) => (n: string) => h[n];

describe("per-request config", () => {
  it("uses the documented header names", () => {
    expect(CONFIG_HEADERS).toEqual({
      jiraBaseUrl: "x-jira-base-url",
      jiraEmail: "x-jira-email",
      jiraApiToken: "x-jira-api-token",
      githubToken: "x-github-token",
      githubUsername: "x-github-username",
      githubOrg: "x-github-org",
    });
  });

  it("parses headers, trims base url, org optional", () => {
    expect(configFromHeaders(get(headers))).toEqual({
      jiraBaseUrl: "https://acme.atlassian.net",
      jiraEmail: "me@acme.com",
      jiraApiToken: "jt",
      githubToken: "gt",
      githubUsername: "me",
      githubOrg: "",
    });
  });

  it("returns null when a required header is missing", () => {
    const { ["x-github-token"]: _, ...rest } = headers;
    expect(configFromHeaders(get(rest))).toBeNull();
  });

  it("isolates concurrent requests", async () => {
    const a = configFromHeaders(get(headers))!;
    const b = { ...a, githubUsername: "other" };
    const seen = await Promise.all([
      runWithConfig(a, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getConfig().githubUsername;
      }),
      runWithConfig(b, async () => getConfig().githubUsername),
    ]);
    expect(seen).toEqual(["me", "other"]);
  });

  it("throws 401 outside a request context", () => {
    expect(() => getConfig()).toThrow(MissingConfigError);
    try {
      getConfig();
    } catch (e: any) {
      expect(e.status).toBe(401);
    }
  });
});
