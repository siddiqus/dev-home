import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { httpMock, useFetchAdapter } from "../../test/fetchAdapter";
import { SETTINGS_EVENT, saveSettings, type AppSettings } from "../../services/config";
import { ApiError } from "../http/errors";
import {
  clearRequiredContextsCache,
  getMergedPrs,
  getOrgMembers,
  getPrBody,
  getPrComments,
  getPrDetail,
  getPrs,
  getReviewedSince,
  getReviews,
  setReviewThreadResolved,
} from "./index";

useFetchAdapter();

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
  adapter = vi.fn(async (config: any) => {
    // Branch protection / rulesets: unprotected (fail-open).
    if (!String(config.url).endsWith("/graphql")) throw notFound(config);
    return ok(config, { data: { search: { nodes: [] } } });
  });
  httpMock.adapter = adapter as any;
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

  it("pages the org's members over GraphQL with their profile names, sorted by login", async () => {
    const pages: Record<string, any> = {
      first: {
        nodes: [
          { login: "zed", name: "Zed Ahmed", avatarUrl: "https://avatars/zed" },
          { login: "abu", name: null, avatarUrl: "https://avatars/abu" },
        ],
        pageInfo: { hasNextPage: true, endCursor: "c1" },
      },
      c1: {
        nodes: [{ login: "mia", name: "  ", avatarUrl: "https://avatars/mia" }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    };
    adapter.mockImplementation(async (config: any) => {
      const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      const page = pages[body.variables.after ?? "first"];
      return ok(config, { data: { organization: { membersWithRole: page } } });
    });

    await expect(getOrgMembers()).resolves.toEqual({
      members: [
        { login: "abu", name: null, avatar_url: "https://avatars/abu" },
        { login: "mia", name: null, avatar_url: "https://avatars/mia" },
        { login: "zed", name: "Zed Ahmed", avatar_url: "https://avatars/zed" },
      ],
    });
    const bodies = graphqlBodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[0].variables).toMatchObject({ org: "test-org", after: null });
    expect(bodies[1].variables).toMatchObject({ org: "test-org", after: "c1" });
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

describe("getPrBody", () => {
  const UUID = "0f590dfb-04c5-4944-8947-d39c46e0ba15";
  const SIGNED = `https://private-user-images.githubusercontent.com/1/2-${UUID}.png?jwt=x&X-Amz-Expires=300`;

  it("points pasted images at the signed URLs from bodyHTML", async () => {
    adapter.mockImplementation(async (config: any) =>
      ok(config, {
        data: {
          repository: {
            pullRequest: {
              body: `<img src="https://github.com/user-attachments/assets/${UUID}" />`,
              bodyHTML: `<p><img src="${SIGNED.replace("&", "&amp;")}"></p>`,
            },
          },
        },
      }),
    );
    await expect(getPrBody({ owner: "test-org", repo: "app", number: 7 })).resolves.toBe(
      `<img src="${SIGNED}" />`,
    );
    const [body] = graphqlBodies();
    expect(body.query).toMatch(/\bbodyHTML\b/);
  });
});

describe("getPrComments", () => {
  it("queries the PR's comments and maps them", async () => {
    adapter.mockImplementation(async (config: any) =>
      ok(config, {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: { pageInfo: { hasPreviousPage: true }, nodes: [] },
              comments: { pageInfo: { hasPreviousPage: false }, nodes: [] },
              reviews: { pageInfo: { hasPreviousPage: false }, nodes: [] },
            },
          },
        },
      }),
    );
    await expect(getPrComments({ owner: "test-org", repo: "app", number: 7 })).resolves.toEqual({
      threads: [],
      conversation: [],
      truncated: true,
    });
    const [body] = graphqlBodies();
    expect(body.query).toContain("query PRComments");
    // Newest threads and conversation items win; older ones only flag truncation.
    for (const field of ["reviewThreads", "comments", "reviews"]) {
      expect(body.query).toContain(`${field}(last: 100)`);
    }
    expect(body.variables).toEqual({ owner: "test-org", repo: "app", number: 7 });
  });

  describe("pasted images", () => {
    const UUID = "0f590dfb-04c5-4944-8947-d39c46e0ba15";
    const PASTED = `![shot](https://github.com/user-attachments/assets/${UUID})`;
    const SIGNED = `https://private-user-images.githubusercontent.com/1/2-${UUID}.png?jwt=x`;
    const author = { __typename: "User", login: "bob", avatarUrl: "" };
    const pullRequest = (bodies: string[]) => ({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false },
        nodes: [
          {
            id: "T1",
            path: "a.ts",
            line: 1,
            comments: {
              pageInfo: { hasNextPage: false },
              nodes: [
                { id: "RC_1", databaseId: 1, body: bodies[0], createdAt: "T1", url: "", author },
              ],
            },
          },
        ],
      },
      comments: {
        pageInfo: { hasPreviousPage: false },
        nodes: [{ id: "IC_2", databaseId: 2, body: bodies[1], createdAt: "T2", url: "", author }],
      },
      reviews: {
        pageInfo: { hasPreviousPage: false },
        nodes: [
          {
            id: "PRR_3",
            databaseId: 3,
            state: "COMMENTED",
            body: bodies[2],
            submittedAt: "T3",
            url: "",
            author,
          },
        ],
      },
    });
    /** Answers the comments query with `pr`, the HTML lookup with `html` (or fails it). */
    const respond = (pr: unknown, html: (ids: string[]) => unknown) =>
      adapter.mockImplementation(async (config: any) => {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        if (body.query.includes("query PRComments")) {
          return ok(config, { data: { repository: { pullRequest: pr } } });
        }
        return ok(config, { data: html(body.variables.ids) });
      });
    const bodiesOf = (c: Awaited<ReturnType<typeof getPrComments>>) => [
      c.threads[0].comments[0].body,
      ...c.conversation.map((i) => i.body),
    ];

    it("fetches bodyHTML only for comments with pasted images, and signs them", async () => {
      respond(pullRequest([PASTED, "plain", PASTED]), (ids) => ({
        nodes: ids.map((id) => ({ id, bodyHTML: `<img src="${SIGNED}">` })),
      }));
      const comments = await getPrComments({ owner: "test-org", repo: "app", number: 7 });
      expect(bodiesOf(comments)).toEqual([`![shot](${SIGNED})`, "plain", `![shot](${SIGNED})`]);
      const [, lookup] = graphqlBodies();
      expect(lookup.variables).toEqual({ ids: ["RC_1", "PRR_3"] });
    });

    it("makes no second call when no comment has a pasted image", async () => {
      respond(pullRequest(["a", "b", "c"]), () => {
        throw new Error("unexpected lookup");
      });
      await getPrComments({ owner: "test-org", repo: "app", number: 7 });
      expect(graphqlBodies()).toHaveLength(1);
    });

    it("still returns the comments when the HTML lookup fails", async () => {
      adapter.mockImplementationOnce(async (config: any) =>
        ok(config, { data: { repository: { pullRequest: pullRequest([PASTED, "b", "c"]) } } }),
      );
      adapter.mockImplementationOnce(async () => {
        throw new Error("network down");
      });
      const comments = await getPrComments({ owner: "test-org", repo: "app", number: 7 });
      expect(bodiesOf(comments)).toEqual([PASTED, "b", "c"]);
    });
  });

  it("returns nothing when the pull request is missing", async () => {
    adapter.mockImplementation(async (config: any) =>
      ok(config, { data: { repository: { pullRequest: null } } }),
    );
    await expect(getPrComments({ owner: "test-org", repo: "app", number: 7 })).resolves.toEqual({
      threads: [],
      conversation: [],
      truncated: false,
    });
  });
});

describe("getReviews", () => {
  it("marks requested PRs the viewer already engaged with", async () => {
    const nodesFor: Record<string, any[]> = {
      "review-requested": [prNode(1), prNode(2)],
      "reviewed-by": [prNode(1)],
      commenter: [prNode(3)],
    };
    adapter.mockImplementation(async (config: any) => {
      if (!String(config.url).endsWith("/graphql")) throw notFound(config);
      const { variables } = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      const kind = String(variables.query).split(":")[0];
      return ok(config, { data: { search: { nodes: nodesFor[kind] } } });
    });

    const { reviews, reviewing } = await getReviews();
    // One request per search, so they run in parallel instead of sequentially.
    const queries = graphqlBodies().map((b) => b.variables.query);
    expect(graphqlBodies().every((b) => b.variables.first === 50)).toBe(true);
    expect(queries).toHaveLength(3);
    expect(queries[0]).toMatch(/^review-requested:testuser /);
    expect(queries[1]).toMatch(/^reviewed-by:testuser -author:testuser /);
    expect(queries[2]).toMatch(/^commenter:testuser -author:testuser /);
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

  afterEach(() => vi.useRealTimers());

  it("serves an answer persisted 23 hours ago without a network call", async () => {
    persisted("testuser", ["ci"], Date.now() - 23 * 60 * 60 * 1000);
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(0);
  });

  it("asks again only once a fetched answer is a day old", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    vi.setSystemTime(new Date("2026-11-05T08:59:00Z"));
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(1);
    vi.setSystemTime(new Date("2026-11-05T09:01:00Z"));
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(2);
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

  const PERSIST_KEY = "dev-home-required-contexts";
  const KEY = "test-org/app@main";

  function persisted(owner: string, names: string[] | null, at: number) {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ owner, entries: { [KEY]: { names, at } } }));
  }

  it("persists the fetched answer to localStorage", async () => {
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    const stored = JSON.parse(localStorage.getItem(PERSIST_KEY)!);
    expect(stored.owner).toBe("testuser");
    expect(stored.entries[KEY].names).toEqual(["ci"]);
  });

  it("serves a fresh persisted answer without a network call", async () => {
    persisted("testuser", ["ci"], Date.now());
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(0);
  });

  it("ignores entries persisted for another GitHub user", async () => {
    persisted("someone-else", ["ci"], Date.now());
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(1);
  });

  it("answers from a stale persisted entry and refreshes it in the background", async () => {
    const at = Date.now() - 25 * 60 * 60 * 1000;
    persisted("testuser", ["old"], at);
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(1);
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem(PERSIST_KEY)!).entries[KEY].at).toBeGreaterThan(at),
    );
    expect(JSON.parse(localStorage.getItem(PERSIST_KEY)!).entries[KEY].names).toEqual(["ci"]);
  });

  it("does not persist transient failures", async () => {
    adapter.mockImplementation(async (config: any) => {
      if (!String(config.url).endsWith("/graphql")) {
        const err: any = new Error("boom");
        err.response = { status: 500, data: {} };
        err.config = config;
        throw err;
      }
      return ok(config, { data: { repository: { pullRequest: prNode(7) } } });
    });
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
  });

  it("treats a rate-limit 403 as transient, not a definitive miss", async () => {
    adapter.mockImplementation(async (config: any) => {
      if (String(config.url).includes("/protection/required_status_checks")) {
        const err: any = new Error("rate limited");
        err.response = { status: 403, data: { message: "rate limit exceeded" } };
        err.config = config;
        throw err;
      }
      if (!String(config.url).endsWith("/graphql")) throw notFound(config);
      return ok(config, { data: { repository: { pullRequest: prNode(7) } } });
    });
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    // Rate-limit 403 is transient: not persisted.
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
    adapter.mockClear();
    // The next call should retry (not use a cached "no protection" answer).
    adapter.mockImplementation(async (config: any) => {
      if (String(config.url).includes("/protection/required_status_checks")) {
        return ok(config, { contexts: ["ci"], checks: [] });
      }
      if (!String(config.url).endsWith("/graphql")) throw notFound(config);
      return ok(config, { data: { repository: { pullRequest: prNode(7) } } });
    });
    await getPrDetail({ owner: "test-org", repo: "app", number: 7 });
    expect(protectionCalls()).toBe(1);
  });
});

describe("getMergedPrs since", () => {
  it("uses the given since in the merged search", async () => {
    await getMergedPrs({ scope: "user", since: new Date("2026-10-08T00:00:00Z") });
    const [body] = graphqlBodies();
    expect(body.variables.query).toContain("merged:>=2026-10-08T00:00:00");
  });
});

describe("getReviewedSince", () => {
  it("keeps the viewer's latest review submitted since `since`", async () => {
    adapter.mockImplementation(async (config: any) => {
      if (!String(config.url).endsWith("/graphql")) throw notFound(config);
      return ok(config, {
        data: {
          search: {
            nodes: [
              {
                ...prNode(1),
                reviews: {
                  nodes: [
                    {
                      state: "COMMENTED",
                      submittedAt: "2026-10-08T09:00:00Z",
                      author: { login: "TestUser" },
                    },
                    {
                      state: "APPROVED",
                      submittedAt: "2026-10-08T12:00:00Z",
                      author: { login: "testuser" },
                    },
                    {
                      state: "CHANGES_REQUESTED",
                      submittedAt: "2026-10-09T12:00:00Z",
                      author: { login: "other" },
                    },
                  ],
                },
              },
              {
                ...prNode(2),
                reviews: {
                  nodes: [
                    {
                      state: "APPROVED",
                      submittedAt: "2026-10-01T00:00:00Z",
                      author: { login: "testuser" },
                    },
                  ],
                },
              },
              {
                ...prNode(3),
                reviews: {
                  nodes: [{ state: "PENDING", submittedAt: null, author: { login: "testuser" } }],
                },
              },
            ],
          },
        },
      });
    });

    const { reviews } = await getReviewedSince(new Date("2026-10-08T00:00:00Z"));
    const [body] = graphqlBodies();
    expect(body.variables.query).toBe(
      "reviewed-by:testuser -author:testuser type:pr updated:>=2026-10-08",
    );
    expect(body.variables.first).toBe(50);
    expect(reviews.map((r) => [r.pr.number, r.state, r.submittedAt])).toEqual([
      [1, "APPROVED", "2026-10-08T12:00:00Z"],
    ]);
  });
});

describe("setReviewThreadResolved", () => {
  const thread = (isResolved: boolean, isOutdated = false) => ({
    id: "T1",
    isResolved,
    isOutdated,
    viewerCanResolve: !isResolved,
    viewerCanUnresolve: isResolved,
  });

  it("resolves a thread and returns its status after", async () => {
    adapter.mockImplementation(async (config: any) =>
      ok(config, { data: { resolveReviewThread: { thread: thread(true) } } }),
    );
    await expect(setReviewThreadResolved({ threadId: "T1", resolved: true })).resolves.toEqual({
      state: "resolved",
      can_resolve: false,
      can_unresolve: true,
    });
    const [body] = graphqlBodies();
    expect(body.query).toContain("resolveReviewThread(");
    expect(body.query).not.toContain("unresolveReviewThread");
    expect(body.variables).toEqual({ threadId: "T1" });
  });

  it("unresolves a thread, which may come back outdated", async () => {
    adapter.mockImplementation(async (config: any) =>
      ok(config, { data: { unresolveReviewThread: { thread: thread(false, true) } } }),
    );
    await expect(setReviewThreadResolved({ threadId: "T1", resolved: false })).resolves.toEqual({
      state: "outdated",
      can_resolve: true,
      can_unresolve: false,
    });
    expect(graphqlBodies()[0].query).toContain("unresolveReviewThread(");
  });
});
