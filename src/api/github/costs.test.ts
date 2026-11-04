import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { httpMock, useFetchAdapter } from "../../test/fetchAdapter";
import { SETTINGS_EVENT, saveSettings, type AppSettings } from "../../services/config";
import { clearListCache, fetchOrgPRsMulti, fetchRecentlyMergedPRs } from "../../services/github";
import {
  buildMergedPrsQuery,
  buildOrgPrsQuery,
  getGithubMentions,
  getMergedPrs,
  resetMentionsCache,
} from "./index";
import { MENTIONS_CACHE_KEY, forgetMentionsMemory } from "./notifications";

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

const API = "https://api.github.com";
const LAST_MODIFIED = "Wed, 30 Sep 2026 12:00:00 GMT";

function response(config: any, data: any, status = 200, headers: Record<string, string> = {}) {
  return { data, status, statusText: status === 304 ? "Not Modified" : "OK", headers, config };
}

/** A mention notification whose latest comment lives at /comments/<id>. */
function notification(
  id: number,
  updatedAt = `2026-09-${String((id % 28) + 1).padStart(2, "0")}T00:00:00Z`,
  opts: { isIssue?: boolean } = {},
) {
  const type = opts.isIssue ? "issues" : "pulls";
  return {
    id: String(id),
    reason: "mention",
    updated_at: updatedAt,
    repository: { full_name: "test-org/app" },
    subject: {
      title: `${opts.isIssue ? "Issue" : "PR"} ${id}`,
      url: `${API}/repos/test-org/app/${type}/${id}`,
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
let inbox: any[];
/** PR nodes returned by the own-PR comments GraphQL search. */
let ownPrs: any[];
/** When set, /notifications answers 304 to a matching If-Modified-Since. */
let notModified: boolean;
/** When set, /notifications answers 304 regardless of request headers. */
let alwaysNotModified: boolean;
/** Subject numbers whose PR reads as merged (closed). */
let closedSubjects: Set<number>;
/** Subject numbers GitHub can't resolve (deleted repo, no access): null alias plus an error. */
let missingSubjects: Set<number>;
/** Subject numbers that are Issues (not PRs). */
let issueSubjects: Set<number>;
/** Subject numbers whose author is a Bot. */
let botSubjects: Set<number>;

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

/** The SubjectStates response for a request's variables. */
function subjectStatesBody(variables: Record<string, any>) {
  const data: Record<string, any> = {};
  const errors: any[] = [];
  for (let i = 0; `n${i}` in variables; i++) {
    const n = variables[`n${i}`];
    if (missingSubjects.has(n)) {
      data[`s${i}`] = null;
      errors.push({ type: "NOT_FOUND", path: [`s${i}`], message: "Could not resolve" });
      continue;
    }
    const isIssue = issueSubjects.has(n);
    data[`s${i}`] = {
      issueOrPullRequest: {
        __typename: isIssue ? "Issue" : "PullRequest",
        ...(isIssue
          ? { issueState: closedSubjects.has(n) ? "CLOSED" : "OPEN" }
          : { prState: closedSubjects.has(n) ? "MERGED" : "OPEN" }),
        databaseId: n * 1000,
        url: `https://github.com/${variables[`o${i}`]}/${variables[`r${i}`]}/${isIssue ? "issues" : "pull"}/${n}`,
        body: `${isIssue ? "Issue" : "PR"} body ${n}`,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
        author: {
          __typename: botSubjects.has(n) ? "Bot" : "User",
          login: botSubjects.has(n) ? "renovate" : "carol",
          avatarUrl: "",
        },
      },
    };
  }
  return errors.length > 0 ? { data, errors } : { data };
}

const isSubjectStates = (config: any) =>
  urlOf(config).endsWith("/graphql") &&
  String(JSON.parse(config.data).query).includes("SubjectStates");

/** Variables of each batched SubjectStates request. */
function subjectBatches(): Record<string, any>[] {
  return adapter.mock.calls
    .map(([c]) => c)
    .filter(isSubjectStates)
    .map((c: any) => JSON.parse(c.data).variables);
}

/** `owner/repo#n` for every subject asked about, across batches. */
function subjectsChecked(): string[] {
  return subjectBatches().flatMap((v) => {
    const out: string[] = [];
    for (let i = 0; `n${i}` in v; i++) out.push(`${v[`o${i}`]}/${v[`r${i}`]}#${v[`n${i}`]}`);
    return out;
  });
}

beforeEach(() => {
  localStorage.clear();
  saveSettings(BASE_SETTINGS);
  resetMentionsCache();
  clearListCache();
  inbox = [];
  ownPrs = [];
  notModified = false;
  alwaysNotModified = false;
  closedSubjects = new Set();
  missingSubjects = new Set();
  issueSubjects = new Set();
  botSubjects = new Set();
  adapter = vi.fn(async (config: any) => {
    const url = urlOf(config);
    if (url.endsWith("/graphql")) {
      if (isSubjectStates(config)) {
        return response(config, subjectStatesBody(JSON.parse(config.data).variables));
      }
      // Own-PR comments search.
      return response(config, { data: { search: { nodes: ownPrs } } });
    }
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
  httpMock.adapter = adapter as any;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getGithubMentions own-PR comments", () => {
  function prComment(id: number, login: string) {
    return {
      databaseId: id,
      url: `https://github.com/test-org/app/pull/5#issuecomment-${id}`,
      body: `c${id}`,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      author: { login, avatarUrl: "" },
    };
  }

  it("merges others' comments on the user's open PRs, deduped against notifications", async () => {
    inbox = [notification(1)];
    ownPrs = [
      {
        number: 5,
        title: "Mine",
        state: "OPEN",
        repository: { nameWithOwner: "test-org/app" },
        comments: { nodes: [prComment(1, "alice"), prComment(10, "testuser")] },
        reviewThreads: { nodes: [{ comments: { nodes: [prComment(11, "bob")] } }] },
      },
    ];
    const { mentions } = await getGithubMentions();
    expect(mentions.map((m) => m.id).sort((a, b) => a - b)).toEqual([1, 11]);
  });
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

  it("builds the mention from the batched subject when the latest event is the PR itself", async () => {
    const n = notification(1);
    n.subject.latest_comment_url = n.subject.url;
    inbox = [n];
    const { mentions } = await getGithubMentions();
    expect(subjectCalls()).toHaveLength(0);
    expect(subjectBatches()).toHaveLength(1);
    expect(mentions).toMatchObject([
      {
        id: 1000,
        html_url: "https://github.com/test-org/app/pull/1",
        body: "PR body 1",
        user: { login: "carol" },
      },
    ]);
  });

  it("handles Issues: keeps open Issue, drops closed, appends [bot] to bot authors", async () => {
    const openIssue = notification(10, undefined, { isIssue: true });
    const closedIssue = notification(20, undefined, { isIssue: true });
    const botIssue = notification(30, undefined, { isIssue: true });
    const userIssue = notification(40, undefined, { isIssue: true });
    openIssue.subject.latest_comment_url = openIssue.subject.url;
    closedIssue.subject.latest_comment_url = closedIssue.subject.url;
    botIssue.subject.latest_comment_url = botIssue.subject.url;
    userIssue.subject.latest_comment_url = userIssue.subject.url;

    issueSubjects.add(10);
    issueSubjects.add(20);
    issueSubjects.add(30);
    issueSubjects.add(40);
    closedSubjects.add(20);
    botSubjects.add(30);
    inbox = [openIssue, closedIssue, botIssue, userIssue];

    const { mentions } = await getGithubMentions();
    expect(subjectBatches()).toHaveLength(1);
    // Open issue kept, closed issue dropped, bot filtered out, user kept
    expect(mentions.map((m) => m.id).sort()).toEqual([10000, 40000]);
    expect(mentions.find((m) => m.id === 10000)).toMatchObject({
      html_url: "https://github.com/test-org/app/issues/10",
      body: "Issue body 10",
      user: { login: "carol" },
    });
    expect(mentions.find((m) => m.id === 40000)).toMatchObject({
      html_url: "https://github.com/test-org/app/issues/40",
      user: { login: "carol" },
    });
  });

  it("makes no subject requests on a refresh with unchanged notifications", async () => {
    inbox = [notification(1), notification(2)];
    await getGithubMentions();
    expect(subjectsChecked()).toHaveLength(2);

    adapter.mockClear();
    const { mentions } = await getGithubMentions();
    expect(subjectBatches()).toHaveLength(0);
    expect(mentions).toHaveLength(2);
  });

  it("re-checks the subject when a thread's updated_at changes, and drops it once closed", async () => {
    inbox = [notification(1, "2026-09-01T00:00:00Z")];
    await getGithubMentions();

    adapter.mockClear();
    inbox = [notification(1, "2026-09-10T00:00:00Z")];
    closedSubjects.add(1);
    const { mentions } = await getGithubMentions();
    expect(subjectsChecked()).toEqual(["test-org/app#1"]);
    expect(mentions).toEqual([]);
  });

  it("looks up at most 50 subjects, in one request, when there are more than 50 notifications", async () => {
    inbox = Array.from({ length: 60 }, (_, i) =>
      notification(i + 1, new Date(Date.UTC(2026, 8, 1, 0, i + 1)).toISOString()),
    );
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(1);
    expect(subjectsChecked()).toHaveLength(50);
    expect(subjectsChecked()).not.toContain("test-org/app#10");
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
    expect(subjectsChecked()).toEqual(["test-org/app#2"]);
    expect(commentCalls()).toEqual([`${API}/repos/test-org/app/issues/comments/2`]);
  });

  it("rechecks cached open subjects after 30 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    inbox = [notification(1)];
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(1);

    adapter.mockClear();
    vi.setSystemTime(new Date("2026-10-01T12:29:00Z"));
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(0);

    vi.setSystemTime(new Date("2026-10-01T12:31:00Z"));
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(1);
  });

  it("keeps cached closed subjects until updated_at changes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    closedSubjects.add(1);
    inbox = [notification(1)];
    await expect(getGithubMentions()).resolves.toEqual({ mentions: [] });
    expect(subjectBatches()).toHaveLength(1);

    adapter.mockClear();
    vi.setSystemTime(new Date("2026-10-01T14:00:00Z"));
    await expect(getGithubMentions()).resolves.toEqual({ mentions: [] });
    expect(subjectBatches()).toHaveLength(0);
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
    expect(subjectBatches()).toHaveLength(0);
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

  it("asks about every subject in one GraphQL request, with no REST subject calls", async () => {
    inbox = [notification(1), notification(2), notification(3)];
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(1);
    expect([...subjectsChecked()].sort()).toEqual([
      "test-org/app#1",
      "test-org/app#2",
      "test-org/app#3",
    ]);
    expect(subjectCalls()).toHaveLength(0);
  });

  it("keeps a thread GitHub can't resolve, and asks about it again next time", async () => {
    missingSubjects.add(2);
    inbox = [notification(1), notification(2)];
    const { mentions } = await getGithubMentions();
    expect(mentions.map((m) => m.id).sort()).toEqual([1, 2]);

    adapter.mockClear();
    await getGithubMentions();
    expect(subjectsChecked()).toEqual(["test-org/app#2"]);
  });

  it("keeps every thread, uncached, when the batch fails", async () => {
    const base = adapter.getMockImplementation() as (config: any) => Promise<any>;
    adapter.mockImplementation(async (config: any) => {
      if (isSubjectStates(config)) throw { response: { status: 502, data: {} } };
      return base(config);
    });
    inbox = [notification(1)];
    expect((await getGithubMentions()).mentions).toHaveLength(1);

    adapter.mockImplementation(base);
    adapter.mockClear();
    await getGithubMentions();
    expect(subjectsChecked()).toEqual(["test-org/app#1"]);
  });

  it("leaves subjects without an issue or PR number unchecked", async () => {
    const n: any = notification(1);
    n.subject.url = `${API}/repos/test-org/app/releases/77`;
    n.subject.latest_comment_url = null;
    inbox = [n];
    await getGithubMentions();
    expect(subjectBatches()).toHaveLength(0);
    expect(subjectCalls()).toHaveLength(0);
  });
});

describe("getGithubMentions saved cache", () => {
  it("answers a reload from the saved cache: a conditional request and no per-thread calls", async () => {
    inbox = [notification(1), notification(2)];
    const first = await getGithubMentions();

    forgetMentionsMemory(); // a page reload
    adapter.mockClear();
    notModified = true;
    const second = await getGithubMentions();
    expect(headerOf(notificationCalls()[0], "If-Modified-Since")).toBe(LAST_MODIFIED);
    expect(commentCalls()).toHaveLength(0);
    expect(subjectCalls()).toHaveLength(0);
    expect(second).toEqual(first);
  });

  it("after a reload, fetches comments only for threads that changed", async () => {
    inbox = [notification(1, "2026-09-01T00:00:00Z"), notification(2, "2026-09-02T00:00:00Z")];
    await getGithubMentions();

    forgetMentionsMemory();
    adapter.mockClear();
    inbox = [notification(1, "2026-09-01T00:00:00Z"), notification(2, "2026-09-10T00:00:00Z")];
    await getGithubMentions();
    expect(commentCalls()).toEqual([`${API}/repos/test-org/app/issues/comments/2`]);
  });

  it("ignores a cache saved for another GitHub user", async () => {
    inbox = [notification(1)];
    await getGithubMentions();
    const saved = JSON.parse(localStorage.getItem(MENTIONS_CACHE_KEY)!);
    localStorage.setItem(MENTIONS_CACHE_KEY, JSON.stringify({ ...saved, owner: "someone-else" }));

    forgetMentionsMemory();
    adapter.mockClear();
    notModified = true;
    await getGithubMentions();
    expect(headerOf(notificationCalls()[0], "If-Modified-Since")).toBeUndefined();
    expect(commentCalls()).toHaveLength(1);
  });

  it("starts cold when the saved cache is garbled", async () => {
    localStorage.setItem(MENTIONS_CACHE_KEY, "{not json");
    forgetMentionsMemory();
    inbox = [notification(1)];
    const { mentions } = await getGithubMentions();
    expect(mentions).toHaveLength(1);
  });

  it("saves only the notification fields it uses", async () => {
    const n: any = {
      ...notification(1),
      unread: true,
      url: "https://api.github.com/notifications/threads/1",
      subscription_url: "https://api.github.com/notifications/threads/1/subscription",
      repository: { full_name: "test-org/app", owner: { login: "test-org" }, private: true },
    };
    inbox = [n];
    await getGithubMentions();
    const saved = JSON.parse(localStorage.getItem(MENTIONS_CACHE_KEY)!);
    expect(saved.owner).toBe("testuser");
    expect(saved.notifications.list).toEqual([
      {
        id: "1",
        reason: "mention",
        updated_at: n.updated_at,
        repository: { full_name: "test-org/app" },
        subject: {
          type: null,
          title: "PR 1",
          url: `${API}/repos/test-org/app/pulls/1`,
          latest_comment_url: `${API}/repos/test-org/app/issues/comments/1`,
        },
      },
    ]);
  });

  it("removes the saved cache when settings change", async () => {
    inbox = [notification(1)];
    await getGithubMentions();
    expect(localStorage.getItem(MENTIONS_CACHE_KEY)).not.toBeNull();
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    expect(localStorage.getItem(MENTIONS_CACHE_KEY)).toBeNull();
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
    ).toBe(`author:testuser type:pr is:merged merged:>=${SINCE} sort:updated-desc`);
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
        ).toBe(`type:pr is:merged merged:>=${SINCE} ${repoPart}${authorPart} sort:updated-desc`);
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

  it("fetchRecentlyMergedPRs reuses a cached result unless forced", async () => {
    await fetchRecentlyMergedPRs("org", AUTHORS, REPOS);
    // Same filters in a different order hit the cache.
    await fetchRecentlyMergedPRs("org", [...AUTHORS].reverse(), [...REPOS].reverse());
    expect(adapter).toHaveBeenCalledTimes(1);
    await fetchRecentlyMergedPRs("org", AUTHORS, REPOS, { force: true });
    expect(adapter).toHaveBeenCalledTimes(2);
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
