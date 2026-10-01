import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import axios from "axios";
import { saveSettings, type AppSettings } from "../../services/config";
import { ApiError } from "../http/errors";
import {
  clearRequiredContextsCache,
  getMergedPrs,
  getOrgMembers,
  getPrDetail,
  getPrs,
  getReviews,
} from "./index";

const BASE_SETTINGS: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "user@example.com",
  jiraApiToken: "jira-token",
  githubToken: "gh-token",
  githubUsername: "testuser",
  githubOrg: "test-org",
  hiddenTabs: [],
};

function ok(config: any, data: any) {
  return { data, status: 200, statusText: "OK", headers: {}, config };
}

function notFound(config: any) {
  const err: any = new Error("Not Found");
  err.response = { status: 404, data: { message: "Not Found" } };
  err.config = config;
  return err;
}

/** Minimal open PR search node. */
function prNode(number: number, repo = "test-org/app") {
  return {
    databaseId: number * 100,
    number,
    title: `PR ${number}`,
    url: `https://github.com/${repo}/pull/${number}`,
    state: "OPEN",
    isDraft: false,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
    author: { login: "someone", avatarUrl: "" },
    headRefName: "feature",
    baseRefName: "main",
    repository: { nameWithOwner: repo },
  };
}

let adapter: ReturnType<typeof vi.fn>;
let originalAdapter: any;

function graphqlBodies(): any[] {
  return adapter.mock.calls
    .map(([config]) => config)
    .filter((c: any) => String(c.url).endsWith("/graphql"))
    .map((c: any) => (typeof c.data === "string" ? JSON.parse(c.data) : c.data));
}

beforeEach(() => {
  localStorage.clear();
  saveSettings(BASE_SETTINGS);
  clearRequiredContextsCache();
  originalAdapter = axios.defaults.adapter;
  adapter = vi.fn(async (config: any) => {
    // Branch protection / rulesets: unprotected (fail-open).
    if (!String(config.url).endsWith("/graphql")) throw notFound(config);
    return ok(config, { data: { search: { nodes: [] } } });
  });
  axios.defaults.adapter = adapter as any;
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
});

describe("getMergedPrs", () => {
  it("returns no PRs for scope org when githubOrg is empty, without any HTTP call", async () => {
    saveSettings({ ...BASE_SETTINGS, githubOrg: "" });
    await expect(getMergedPrs({ scope: "org" })).resolves.toEqual({ prs: [] });
    expect(adapter).not.toHaveBeenCalled();
  });

  it("searches the user's merged PRs for scope user", async () => {
    await expect(getMergedPrs({ scope: "user" })).resolves.toEqual({ prs: [] });
    const [body] = graphqlBodies();
    expect(body.variables.query).toContain("author:testuser type:pr is:merged");
  });
});

describe("getOrgMembers", () => {
  it("returns no members when githubOrg is empty", async () => {
    saveSettings({ ...BASE_SETTINGS, githubOrg: "" });
    await expect(getOrgMembers()).resolves.toEqual({ members: [] });
    expect(adapter).not.toHaveBeenCalled();
  });
});

describe("getPrDetail", () => {
  it("throws ApiError 404 when the pull request is null", async () => {
    adapter.mockImplementation(async (config: any) =>
      ok(config, { data: { repository: { pullRequest: null } } }),
    );
    const promise = getPrDetail({ owner: "test-org", repo: "app", number: 1 });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 404,
      message: "Pull request not found",
    });
  });

  it("returns the mapped PR", async () => {
    adapter.mockImplementation(async (config: any) => {
      if (!String(config.url).endsWith("/graphql")) throw notFound(config);
      return ok(config, { data: { repository: { pullRequest: prNode(7) } } });
    });
    const { pr } = await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(pr).toMatchObject({ number: 7, repo_full_name: "test-org/app", state: "open" });
  });
});

describe("getReviews", () => {
  it("marks requested PRs the viewer already engaged with", async () => {
    adapter.mockImplementation(async (config: any) => {
      if (!String(config.url).endsWith("/graphql")) throw notFound(config);
      const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      const q: string = body.variables.query;
      let nodes: any[] = [];
      if (q.startsWith("review-requested:")) nodes = [prNode(1), prNode(2)];
      else if (q.startsWith("reviewed-by:")) nodes = [prNode(1)];
      else if (q.startsWith("commenter:")) nodes = [prNode(3)];
      return ok(config, { data: { search: { nodes } } });
    });

    const { reviews, reviewing } = await getReviews();
    expect(reviews.map((pr) => [pr.number, pr.viewer_engaged])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(reviewing.map((pr) => pr.number).sort()).toEqual([1, 3]);
  });
});

describe("unconfigured settings", () => {
  it("getPrs rejects with ApiError 401", async () => {
    localStorage.clear();
    const promise = getPrs();
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 401 });
  });
});
