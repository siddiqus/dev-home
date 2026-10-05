import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import axios from "axios";
import { SETTINGS_EVENT, saveSettings, type AppSettings } from "../../services/config";
import { fetchOrgPRsMulti, fetchRecentlyMergedPRs } from "../../services/github";
import {
  buildMergedPrsQuery,
  buildOrgPrsQuery,
  getGithubMentions,
  getMergedPrs,
  resetMentionsCache,
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

const API = "https://api.github.com";
const LAST_MODIFIED = "Wed, 30 Sep 2026 12:00:00 GMT";

function response(config: any, data: any, status = 200, headers: Record<string, string> = {}) {
  return { data, status, statusText: status === 304 ? "Not Modified" : "OK", headers, config };
}

/** A mention notification whose latest comment lives at /comments/<id>. */
function notification(
  id: number,
  updatedAt = `2026-09-${String((id % 28) + 1).padStart(2, "0")}T00:00:00Z`,
) {
  return {
    id: String(id),
    reason: "mention",
    updated_at: updatedAt,
    repository: { full_name: "test-org/app" },
    subject: {
      title: `PR ${id}`,
      url: `${API}/repos/test-org/app/pulls/${id}`,
      latest_comment_url: `${API}/repos/test-org/app/issues/comments/${id}`,
    },
  };
}

function comment(id: number) {
  return {
    id,
    html_url: `https://github.com/test-org/app/pull/${id}#issuecomment-${id}`,
    body: `comment ${id}`,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    user: { login: "alice", avatar_url: "" },
  };
}

let adapter: ReturnType<typeof vi.fn>;
let originalAdapter: any;
let inbox: any[];
/** When set, /notifications answers 304 to a matching If-Modified-Since. */
let notModified: boolean;
/** When set, /notifications answers 304 regardless of request headers. */
let alwaysNotModified: boolean;

function urlOf(config: any): string {
  const url = String(config.url);
  return url.startsWith("http") ? url : `${config.baseURL}${url}`;
}

function headerOf(config: any, name: string): string | undefined {
  const headers = config.headers;
  if (!headers) return undefined;
  if (typeof headers.get === "function") return headers.get(name) ?? undefined;
  return headers[name];
}

function notificationCalls(): any[] {
  return adapter.mock.calls.map(([c]) => c).filter((c: any) => urlOf(c).endsWith("/notifications"));
}

function commentCalls(): string[] {
  return adapter.mock.calls
    .map(([c]) => urlOf(c))
    .filter((u: string) => u.includes("/issues/comments/"));
}

function subjectCalls(): string[] {
  return adapter.mock.calls.map(([c]) => urlOf(c)).filter((u: string) => /\/pulls\/\d+$/.test(u));
}

beforeEach(() => {
  localStorage.clear();
  saveSettings(BASE_SETTINGS);
  resetMentionsCache();
  inbox = [];
  notModified = false;
  alwaysNotModified = false;
  originalAdapter = axios.defaults.adapter;
  adapter = vi.fn(async (config: any) => {
    const url = urlOf(config);
    if (url.endsWith("/notifications")) {
      if (
        alwaysNotModified ||
        (notModified && headerOf(config, "If-Modified-Since") === LAST_MODIFIED)
      ) {
        const res = response(config, "", 304);
        if (config.validateStatus && !config.validateStatus(304)) {
          const err: any = new Error("Not Modified");
          err.response = res;
          err.config = config;
          throw err;
        }
        return res;
      }
      return response(config, inbox, 200, { "last-modified": LAST_MODIFIED });
    }
    const commentMatch = url.match(/\/issues\/comments\/(\d+)$/);
    if (commentMatch) return response(config, comment(Number(commentMatch[1])));
    // Subject lookups: everything is still open.
    return response(config, { state: "open" });
  });
  axios.defaults.adapter = adapter as any;
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  vi.useRealTimers();
});

describe("getGithubMentions caching", () => {
  it("sends If-Modified-Since on the next call and makes no comment requests on 304", async () => {
    inbox = [notification(1), notification(2)];
    const first = await getGithubMentions();
    expect(first.mentions).toHaveLength(2);
    expect(headerOf(notificationCalls()[0], "If-Modified-Since")).toBeUndefined();
    expect(commentCalls()).toHaveLength(2);

    adapter.mockClear();
    notModified = true;
    const second = await getGithubMentions();
    expect(headerOf(notificationCalls()[0], "If-Modified-Since")).toBe(LAST_MODIFIED);
    expect(commentCalls()).toHaveLength(0);
    expect(second).toEqual(first);
  });

  it("re-fetches only threads whose updated_at changed", async () => {
    inbox = [notification(1, "2026-09-01T00:00:00Z"), notification(2, "2026-09-02T00:00:00Z")];
    await getGithubMentions();
    expect(commentCalls()).toHaveLength(2);

    adapter.mockClear();
    inbox = [notification(1, "2026-09-01T00:00:00Z"), notification(2, "2026-09-10T00:00:00Z")];
    const { mentions } = await getGithubMentions();
    expect(commentCalls()).toEqual([`${API}/repos/test-org/app/issues/comments/2`]);
    expect(mentions.map((m) => m.id).sort()).toEqual([1, 2]);
  });

  it("processes only the newest 50 threads", async () => {
    inbox = Array.from({ length: 60 }, (_, i) =>
      notification(i + 1, new Date(Date.UTC(2026, 8, 1, 0, i + 1)).toISOString()),
    );
    const { mentions } = await getGithubMentions();
    expect(commentCalls()).toHaveLength(50);
    expect(mentions).toHaveLength(50);
    // Newest 50 = ids 11..60
    expect(Math.min(...mentions.map((m) => m.id))).toBe(11);
  });

  it("stops paging once a full page yields 50 threads", async () => {
    inbox = Array.from({ length: 100 }, (_, i) => notification(i + 1));
    await getGithubMentions();
    expect(notificationCalls()).toHaveLength(1);
  });

  it("reuses the subject response when the latest comment URL is the subject itself", async () => {
    const n = notification(1);
    n.subject.latest_comment_url = n.subject.url;
    inbox = [n];
    const { mentions } = await getGithubMentions();
    expect(subjectCalls()).toHaveLength(1);
    expect(mentions).toHaveLength(0); // the subject stub has no author, so it's filtered
  });

  it("makes no subject requests on a refresh with unchanged notifications", async () => {
    inbox = [notification(1), notification(2)];
    await getGithubMentions();
    expect(subjectCalls()).toHaveLength(2);

    adapter.mockClear();
    const { mentions } = await getGithubMentions();
    expect(subjectCalls()).toHaveLength(0);
    expect(mentions).toHaveLength(2);
  });

  it("re-checks the subject when a thread's updated_at changes, and drops it once closed", async () => {
    inbox = [notification(1, "2026-09-01T00:00:00Z")];
    await getGithubMentions();

    adapter.mockClear();
    inbox = [notification(1, "2026-09-10T00:00:00Z")];
    const base = adapter.getMockImplementation() as (config: any) => Promise<any>;
    adapter.mockImplementation(async (config: any) =>
      /\/pulls\/1$/.test(urlOf(config)) ? response(config, { state: "closed" }) : base(config),
    );
    const { mentions } = await getGithubMentions();
    expect(subjectCalls()).toHaveLength(1);
    expect(mentions).toEqual([]);
  });

  it("looks up at most 50 subjects when there are more than 50 notifications", async () => {
    inbox = Array.from({ length: 60 }, (_, i) =>
      notification(i + 1, new Date(Date.UTC(2026, 8, 1, 0, i + 1)).toISOString()),
    );
    await getGithubMentions();
    expect(subjectCalls()).toHaveLength(50);
    expect(subjectCalls()).not.toContain(`${API}/repos/test-org/app/pulls/10`);
  });

  it("evicts cached state for a thread that left the inbox", async () => {
    inbox = [notification(1), notification(2)];
    await getGithubMentions();

    inbox = [notification(1)];
    await getGithubMentions();

    // Thread 2 returns with the same updated_at, but its cache entries are gone.
    adapter.mockClear();
    inbox = [notification(1), notification(2)];
    await getGithubMentions();
    expect(subjectCalls()).toEqual([`${API}/repos/test-org/app/pulls/2`]);
    expect(commentCalls()).toEqual([`${API}/repos/test-org/app/issues/comments/2`]);
  });

  it("rechecks cached open subjects after 30 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    inbox = [notification(1)];
    await getGithubMentions();
    expect(subjectCalls()).toHaveLength(1);

    adapter.mockClear();
    vi.setSystemTime(new Date("2026-10-01T12:29:00Z"));
    await getGithubMentions();
    expect(subjectCalls()).toHaveLength(0);

    vi.setSystemTime(new Date("2026-10-01T12:31:00Z"));
    await getGithubMentions();
    expect(subjectCalls()).toHaveLength(1);
  });

  it("keeps cached closed subjects until updated_at changes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    const base = adapter.getMockImplementation() as (config: any) => Promise<any>;
    adapter.mockImplementation(async (config: any) =>
      /\/pulls\/1$/.test(urlOf(config)) ? response(config, { state: "closed" }) : base(config),
    );
    inbox = [notification(1)];
    await expect(getGithubMentions()).resolves.toEqual({ mentions: [] });
    expect(subjectCalls()).toHaveLength(1);

    adapter.mockClear();
    vi.setSystemTime(new Date("2026-10-01T14:00:00Z"));
    await expect(getGithubMentions()).resolves.toEqual({ mentions: [] });
    expect(subjectCalls()).toHaveLength(0);
  });

  it("drops the conditional header when the since window changes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    inbox = [notification(1)];
    await getGithubMentions();

    adapter.mockClear();
    notModified = true;
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    const { mentions } = await getGithubMentions();
    const [call] = notificationCalls();
    expect(call.params.since).toBe("2026-08-02T00:00:00Z");
    expect(headerOf(call, "If-Modified-Since")).toBeUndefined();
    expect(mentions).toHaveLength(1);
  });

  it("treats a 304 with nothing cached as an empty list, then does a full fetch", async () => {
    alwaysNotModified = true;
    inbox = [notification(1)];
    await expect(getGithubMentions()).resolves.toEqual({ mentions: [] });
    expect(subjectCalls()).toHaveLength(0);
    expect(commentCalls()).toHaveLength(0);

    adapter.mockClear();
    alwaysNotModified = false;
    const { mentions } = await getGithubMentions();
    expect(headerOf(notificationCalls()[0], "If-Modified-Since")).toBeUndefined();
    expect(mentions).toHaveLength(1);
  });

  it("is reset when SETTINGS_EVENT fires on window", async () => {
    inbox = [notification(1)];
    await getGithubMentions();
    adapter.mockClear();
    notModified = true;
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    await getGithubMentions();
    expect(headerOf(notificationCalls()[0], "If-Modified-Since")).toBeUndefined();
    expect(commentCalls()).toHaveLength(1);
  });
});

const SINCE = "2026-09-28T00:00:00Z";
const AUTHOR_CASES: [string, string[], string][] = [
  ["no authors", [], ""],
  ["one author", ["alice"], " author:alice"],
  ["many authors", ["alice", "bob", "carol"], " author:alice author:bob author:carol"],
];
const REPO_CASES: [string, string[], string][] = [
  ["no repos", [], "org:test-org"],
  ["one repo", ["test-org/app"], "repo:test-org/app"],
  ["many repos", ["test-org/app", "test-org/api"], "repo:test-org/app repo:test-org/api"],
];

describe("buildMergedPrsQuery", () => {
  it("searches the user's own merged PRs for scope user", () => {
    expect(
      buildMergedPrsQuery({
        scope: "user",
        username: "testuser",
        org: "test-org",
        authors: ["alice"],
        repos: ["test-org/app"],
        since: SINCE,
      }),
    ).toBe(`author:testuser type:pr is:merged merged:>=${SINCE}`);
  });

  it("returns null for scope org without an org", () => {
    expect(
      buildMergedPrsQuery({
        scope: "org",
        username: "testuser",
        org: "",
        authors: [],
        repos: [],
        since: SINCE,
      }),
    ).toBeNull();
  });

  for (const [authorLabel, authors, authorPart] of AUTHOR_CASES) {
    for (const [repoLabel, repos, repoPart] of REPO_CASES) {
      it(`ORs qualifiers for ${authorLabel} x ${repoLabel}`, () => {
        expect(
          buildMergedPrsQuery({
            scope: "org",
            username: "testuser",
            org: "test-org",
            authors,
            repos,
            since: SINCE,
          }),
        ).toBe(`type:pr is:merged merged:>=${SINCE} ${repoPart}${authorPart}`);
      });
    }
  }
});

describe("buildOrgPrsQuery", () => {
  for (const [authorLabel, authors, authorPart] of AUTHOR_CASES) {
    for (const [repoLabel, repos, repoPart] of REPO_CASES) {
      it(`ORs qualifiers for ${authorLabel} x ${repoLabel}`, () => {
        expect(buildOrgPrsQuery({ org: "test-org", authors, repos })).toBe(
          `${repoPart} type:pr state:open draft:false sort:updated-desc${authorPart}`,
        );
      });
    }
  }
});

describe("multi-author / multi-repo PR searches", () => {
  const AUTHORS = ["alice", "bob", "carol"];
  const REPOS = ["test-org/app", "test-org/api"];

  function graphqlBodies(): any[] {
    return adapter.mock.calls
      .map(([c]) => c)
      .filter((c: any) => urlOf(c).endsWith("/graphql"))
      .map((c: any) => (typeof c.data === "string" ? JSON.parse(c.data) : c.data));
  }

  beforeEach(() => {
    adapter.mockImplementation(async (config: any) =>
      response(config, {
        data: { search: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
      }),
    );
  });

  it("fetchOrgPRsMulti makes exactly one HTTP call for 3 authors x 2 repos", async () => {
    await expect(fetchOrgPRsMulti(AUTHORS, REPOS)).resolves.toEqual([]);
    expect(adapter).toHaveBeenCalledTimes(1);
    const [body] = graphqlBodies();
    expect(body.variables.query).toBe(
      buildOrgPrsQuery({ org: "test-org", authors: AUTHORS, repos: REPOS }),
    );
    expect(body.variables.first).toBe(100);
  });

  it("fetchRecentlyMergedPRs makes exactly one HTTP call for 3 authors x 2 repos", async () => {
    await expect(fetchRecentlyMergedPRs("org", AUTHORS, REPOS)).resolves.toEqual([]);
    expect(adapter).toHaveBeenCalledTimes(1);
    const [body] = graphqlBodies();
    expect(body.variables.query).toContain(
      "repo:test-org/app repo:test-org/api author:alice author:bob author:carol",
    );
    expect(body.variables.first).toBe(50);
  });

  it("fetchOrgPRsMulti keeps the page of 10 for a single author and repo", async () => {
    await fetchOrgPRsMulti(["alice"], ["test-org/app"]);
    expect(graphqlBodies()[0].variables.first).toBe(10);
  });

  it("getMergedPrs keeps first: 20 for a single author and repo", async () => {
    await getMergedPrs({ scope: "org", authors: ["alice"], repos: ["test-org/app"] });
    expect(graphqlBodies()[0].variables.first).toBe(20);
  });
});
