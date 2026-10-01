import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import axios from "axios";
import { SETTINGS_EVENT, saveSettings, type AppSettings } from "../../services/config";
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

  it("throws ApiError 404 on a GraphQL NOT_FOUND error", async () => {
    adapter.mockImplementation(async (config: any) =>
      ok(config, {
        data: { repository: null },
        errors: [
          {
            type: "NOT_FOUND",
            path: ["repository"],
            message: "Could not resolve to a Repository with the name 'test-org/nope'.",
          },
        ],
      }),
    );
    const promise = getPrDetail({ owner: "test-org", repo: "nope", number: 1 });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 404,
      message: "Pull request not found",
    });
  });

  it("throws ApiError 500 on other GraphQL errors", async () => {
    adapter.mockImplementation(async (config: any) =>
      ok(config, { data: null, errors: [{ type: "FORBIDDEN", message: "Nope" }] }),
    );
    await expect(getPrDetail({ owner: "test-org", repo: "app", number: 1 })).rejects.toMatchObject({
      status: 500,
      message: "GitHub GraphQL error: Nope",
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
      return ok(config, {
        data: {
          requested: { nodes: [prNode(1), prNode(2)] },
          reviewedBy: { nodes: [prNode(1)] },
          commented: { nodes: [prNode(3)] },
        },
      });
    });

    const { reviews, reviewing } = await getReviews();
    const bodies = graphqlBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].variables).toMatchObject({ first: 50 });
    expect(bodies[0].variables.requestedQuery).toMatch(/^review-requested:testuser /);
    expect(bodies[0].variables.reviewedQuery).toMatch(/^reviewed-by:testuser -author:testuser /);
    expect(bodies[0].variables.commentedQuery).toMatch(/^commenter:testuser -author:testuser /);
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

describe("required contexts cache", () => {
  function protectionCalls(): number {
    return adapter.mock.calls.filter(([c]: any[]) =>
      String(c.url).includes("/protection/required_status_checks"),
    ).length;
  }

  beforeEach(() => {
    adapter.mockImplementation(async (config: any) => {
      if (String(config.url).includes("/protection/required_status_checks")) {
        return ok(config, { contexts: ["ci"], checks: [] });
      }
      if (!String(config.url).endsWith("/graphql")) throw notFound(config);
      return ok(config, { data: { repository: { pullRequest: prNode(7) } } });
    });
  });

  it("reuses the cached entry for the same owner/repo@branch", async () => {
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(1);
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(1);
  });

  it("is cleared when SETTINGS_EVENT fires on window", async () => {
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(1);
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(2);
  });
});
