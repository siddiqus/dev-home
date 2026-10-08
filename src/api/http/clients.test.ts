import { describe, it, expect, beforeEach, vi } from "vitest";
import { httpMock, useFetchAdapter } from "../../test/fetchAdapter";
import { saveSettings } from "../../services/config";
import { requireSettings, base64Utf8 } from "./credentials";
import { githubRest, githubGraphql } from "./github";
import { jiraClient, jiraClientV2, jiraAgileClient } from "./jira";
import { ApiError } from "./errors";

useFetchAdapter();

/** URL actually passed to fetch on the most recent call. */
const lastFetchUrl = () => String(vi.mocked(fetch).mock.calls.at(-1)![0]);

describe("requireSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("throws ApiError status 401 when unconfigured", () => {
    expect(() => requireSettings()).toThrow(ApiError);
    try {
      requireSettings();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
      expect((err as ApiError).message).toContain("Missing credentials");
    }
  });

  it("returns settings when configured", () => {
    saveSettings({
      jiraBaseUrl: "https://example.atlassian.net",
      jiraEmail: "user@example.com",
      jiraApiToken: "jira-token",
      githubToken: "gh-token",
      githubUsername: "testuser",
      githubOrg: "test-org",
      hiddenTabs: [],
    });
    const settings = requireSettings();
    expect(settings.githubToken).toBe("gh-token");
  });
});

describe("base64Utf8", () => {
  it("encodes UTF-8 strings correctly", () => {
    const result = base64Utf8("é:ü");
    const expected = Buffer.from("é:ü", "utf8").toString("base64");
    expect(result).toBe(expected);
  });
});

describe("GitHub clients", () => {
  beforeEach(() => {
    localStorage.clear();
    saveSettings({
      jiraBaseUrl: "https://example.atlassian.net",
      jiraEmail: "user@example.com",
      jiraApiToken: "jira-token",
      githubToken: "gh-test-token",
      githubUsername: "testuser",
      githubOrg: "test-org",
      hiddenTabs: [],
    });
    httpMock.adapter = vi.fn(async (config) => ({
      data: { login: "testuser" },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    }));
  });

  it("githubRest().get('/user') has correct config", async () => {
    const client = githubRest();
    await client.get("/user");
    const calls = (httpMock.adapter as any).mock.calls;
    const config = calls[calls.length - 1][0];
    expect(lastFetchUrl()).toBe("https://api.github.com/user");
    expect(config.headers.Authorization).toBe("Bearer gh-test-token");
    expect(config.headers.Accept).toBe("application/vnd.github+json");
  });

  it("githubGraphql posts query and variables, returns data.data", async () => {
    httpMock.adapter = vi.fn(async (config) => ({
      data: { data: { viewer: { login: "testuser" } } },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    }));
    const result = await githubGraphql("query{viewer{login}}", { a: 1 });
    expect(result).toEqual({ viewer: { login: "testuser" } });
    const calls = (httpMock.adapter as any).mock.calls;
    const config = calls[calls.length - 1][0];
    expect(lastFetchUrl()).toBe("https://api.github.com/graphql");
    expect(config.method).toBe("post");
    const data = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    expect(data).toEqual({ query: "query{viewer{login}}", variables: { a: 1 } });
  });

  it("githubGraphql throws on GraphQL errors", async () => {
    httpMock.adapter = vi.fn(async (config) => ({
      data: { data: null, errors: [{ message: "x" }, { message: "y" }] },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    }));
    await expect(githubGraphql("query{bad}")).rejects.toThrow("GitHub GraphQL error: x; y");
    try {
      await githubGraphql("query{bad}");
    } catch (err: any) {
      expect(err.graphqlErrors).toHaveLength(2);
    }
  });

  it("401 response from GitHub with Bad credentials rejects with ApiError", async () => {
    httpMock.adapter = vi.fn(async (_config) => {
      throw {
        response: { status: 401, data: { message: "Bad credentials" } },
        message: "Request failed with status code 401",
      };
    });
    await expect(githubRest().get("/user")).rejects.toThrow(ApiError);
    try {
      await githubRest().get("/user");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
      expect((err as ApiError).message).toBe("Bad credentials");
    }
  });
});

describe("Jira clients", () => {
  beforeEach(() => {
    localStorage.clear();
    saveSettings({
      jiraBaseUrl: "https://example.atlassian.net/",
      jiraEmail: "user@example.com",
      jiraApiToken: "jira-token",
      githubToken: "gh-test-token",
      githubUsername: "testuser",
      githubOrg: "test-org",
      hiddenTabs: [],
    });
    httpMock.adapter = vi.fn(async (config) => ({
      data: { results: [] },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    }));
  });

  it("jiraClient().post('/search/jql') has correct config", async () => {
    const client = jiraClient();
    await client.post("/search/jql", { jql: "project = TEST" });
    const calls = (httpMock.adapter as any).mock.calls;
    const config = calls[calls.length - 1][0];
    expect(lastFetchUrl()).toBe("/jira-proxy/rest/api/3/search/jql");
    expect(config.headers["x-jira-base-url"]).toBe("https://example.atlassian.net");
    expect(config.headers.Authorization).toBe(`Basic ${base64Utf8("user@example.com:jira-token")}`);
  });

  it("jiraClientV2() baseURL ends /jira-proxy/rest/api/2", async () => {
    const client = jiraClientV2();
    await client.get("/user/search");
    expect(lastFetchUrl()).toBe("/jira-proxy/rest/api/2/user/search");
  });

  it("jiraAgileClient() baseURL ends /jira-proxy/rest/agile/1.0", async () => {
    const client = jiraAgileClient();
    await client.get("/board");
    expect(lastFetchUrl()).toBe("/jira-proxy/rest/agile/1.0/board");
  });

  it("drops null/undefined params and lets absolute URLs bypass baseURL", async () => {
    await jiraAgileClient().get("/board", { params: { type: "scrum", name: undefined, page: 2 } });
    expect(lastFetchUrl()).toBe("/jira-proxy/rest/agile/1.0/board?type=scrum&page=2");
    await githubRest().get("https://api.github.com/repos/o/r/pulls/1");
    expect(lastFetchUrl()).toBe("https://api.github.com/repos/o/r/pulls/1");
  });

  it("network failure rejects with ApiError status 0", async () => {
    httpMock.adapter = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(jiraClient().get("/myself")).rejects.toMatchObject({
      status: 0,
      message: "Failed to fetch",
    });
  });

  it("400 from proxy with custom error message rejects with ApiError", async () => {
    httpMock.adapter = vi.fn(async (_config) => {
      throw {
        response: { status: 400, data: { error: "Jira base URL not allowed: example.com" } },
        message: "Request failed with status code 400",
      };
    });
    await expect(jiraClient().get("/issue/TEST-1")).rejects.toThrow(ApiError);
    try {
      await jiraClient().get("/issue/TEST-1");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).message).toContain("Jira base URL not allowed");
    }
  });
});
