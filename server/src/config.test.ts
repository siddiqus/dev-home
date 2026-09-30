import { describe, expect, it } from "vitest";
import {
  CONFIG_HEADERS,
  configFromHeaders,
  getConfig,
  MissingConfigError,
  JiraUrlNotAllowedError,
  runWithConfig,
} from "./config";

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { "x-github-token": _unused, ...rest } = headers;
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

  it("signals disallowed http:// jira URLs", () => {
    const h = { ...headers, "x-jira-base-url": "http://acme.atlassian.net" };
    expect(configFromHeaders(get(h))).toEqual({ jiraUrlNotAllowed: true });
  });

  it("signals disallowed non-atlassian https:// URLs", () => {
    const h = { ...headers, "x-jira-base-url": "https://evil.example.com" };
    expect(configFromHeaders(get(h))).toEqual({ jiraUrlNotAllowed: true });
  });

  it("signals disallowed SSRF attempts like metadata endpoints", () => {
    const h = { ...headers, "x-jira-base-url": "https://169.254.169.254" };
    expect(configFromHeaders(get(h))).toEqual({ jiraUrlNotAllowed: true });
  });

  it("allows custom Jira hosts via JIRA_ALLOWED_HOSTS and normalizes to origin", () => {
    const original = process.env.JIRA_ALLOWED_HOSTS;
    process.env.JIRA_ALLOWED_HOSTS = "jira.corp.example";
    const h = { ...headers, "x-jira-base-url": "https://jira.corp.example/foo/" };
    expect(configFromHeaders(get(h))).toEqual({
      jiraBaseUrl: "https://jira.corp.example",
      jiraEmail: "me@acme.com",
      jiraApiToken: "jt",
      githubToken: "gt",
      githubUsername: "me",
      githubOrg: "",
    });
    if (original !== undefined) {
      process.env.JIRA_ALLOWED_HOSTS = original;
    } else {
      delete process.env.JIRA_ALLOWED_HOSTS;
    }
  });

  it("throws 400 JiraUrlNotAllowedError when the URL is disallowed", () => {
    const disallowed = { jiraUrlNotAllowed: true as const };
    expect(() => runWithConfig(disallowed, () => getConfig())).toThrow(JiraUrlNotAllowedError);
    try {
      runWithConfig(disallowed, () => getConfig());
    } catch (e: any) {
      expect(e.status).toBe(400);
      expect(e.message).toContain("Jira base URL not allowed");
    }
  });
});
