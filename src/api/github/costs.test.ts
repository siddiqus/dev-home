import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import axios from "axios";
import { SETTINGS_EVENT, saveSettings, type AppSettings } from "../../services/config";
import { getGithubMentions, resetMentionsCache } from "./index";

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

beforeEach(() => {
  localStorage.clear();
  saveSettings(BASE_SETTINGS);
  resetMentionsCache();
  inbox = [];
  notModified = false;
  originalAdapter = axios.defaults.adapter;
  adapter = vi.fn(async (config: any) => {
    const url = urlOf(config);
    if (url.endsWith("/notifications")) {
      if (notModified && headerOf(config, "If-Modified-Since") === LAST_MODIFIED) {
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
