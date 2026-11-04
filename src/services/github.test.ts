import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GitHubPR, PRComments, PRReviewThread } from "../types";
import {
  approvePr,
  enqueuePr,
  getMergeOptions,
  getMergedPrs,
  getPrComments,
  mergePr,
  setReviewThreadResolved,
  type MergeOptions,
} from "../api/github";
import {
  approvePR,
  clearListCache,
  fetchMergeOptions,
  fetchMyMergedPRs,
  fetchPRComments,
  mergePR,
  mergedSince,
  MY_MERGED_DAYS,
  setPRThreadResolved,
} from "./github";
import { SETTINGS_EVENT } from "./config";

vi.mock("../api/github", () => ({
  approvePr: vi.fn(),
  getMergeOptions: vi.fn(),
  getMergedPrs: vi.fn(),
  mergePr: vi.fn(),
  enqueuePr: vi.fn(),
  getPrComments: vi.fn(),
  setReviewThreadResolved: vi.fn(),
}));

function pr(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 12,
    title: "PR",
    html_url: "https://github.com/o/app/pull/12",
    state: "open",
    draft: false,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: "feature", sha: "abc123" },
    base: { ref: "main" },
    repo_full_name: "o/app",
    checks_status: "SUCCESS",
    checks: [],
    review_status: "APPROVED",
    ...overrides,
  };
}

const OPTIONS: MergeOptions = { pullRequestId: "PR_node", queue: false, methods: ["SQUASH"] };

beforeEach(() => {
  vi.mocked(getMergeOptions).mockReset();
  vi.mocked(mergePr).mockReset();
  vi.mocked(enqueuePr).mockReset();
  vi.mocked(getPrComments).mockReset();
  vi.mocked(setReviewThreadResolved).mockReset();
  window.dispatchEvent(new Event(SETTINGS_EVENT));
});

describe("fetchMergeOptions", () => {
  it("looks the PR up once per session", async () => {
    vi.mocked(getMergeOptions).mockResolvedValue(OPTIONS);
    await expect(fetchMergeOptions(pr())).resolves.toBe(OPTIONS);
    await fetchMergeOptions(pr({ updated_at: "2026-10-03T00:00:00Z" }));
    expect(getMergeOptions).toHaveBeenCalledTimes(1);
    expect(getMergeOptions).toHaveBeenCalledWith({ owner: "o", repo: "app", number: 12 });
  });

  it("retries after a failed lookup", async () => {
    vi.mocked(getMergeOptions).mockRejectedValueOnce(new Error("down"));
    await expect(fetchMergeOptions(pr())).rejects.toThrow("down");
    vi.mocked(getMergeOptions).mockResolvedValue(OPTIONS);
    await expect(fetchMergeOptions(pr())).resolves.toBe(OPTIONS);
  });
});

describe("fetchPRComments", () => {
  const COMMENTS: PRComments = { threads: [], conversation: [], truncated: false };

  it("fetches a PR's comments once per update", async () => {
    vi.mocked(getPrComments).mockResolvedValue(COMMENTS);
    await expect(fetchPRComments(pr())).resolves.toBe(COMMENTS);
    await fetchPRComments(pr());
    expect(getPrComments).toHaveBeenCalledTimes(1);
    expect(getPrComments).toHaveBeenCalledWith({ owner: "o", repo: "app", number: 12 });
    await fetchPRComments(pr({ updated_at: "2026-10-03T00:00:00Z" }));
    expect(getPrComments).toHaveBeenCalledTimes(2);
  });

  it("retries after a failed fetch", async () => {
    vi.mocked(getPrComments).mockRejectedValueOnce(new Error("down"));
    await expect(fetchPRComments(pr())).rejects.toThrow("down");
    vi.mocked(getPrComments).mockResolvedValue(COMMENTS);
    await expect(fetchPRComments(pr())).resolves.toBe(COMMENTS);
  });

  it("forgets everything when settings change", async () => {
    vi.mocked(getPrComments).mockResolvedValue(COMMENTS);
    await fetchPRComments(pr());
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    await fetchPRComments(pr());
    expect(getPrComments).toHaveBeenCalledTimes(2);
  });
});

describe("setPRThreadResolved", () => {
  const thread: PRReviewThread = {
    id: "T1",
    path: "a.ts",
    line: 1,
    state: "open",
    hunk: [],
    comments: [],
    html_url: "",
    can_resolve: true,
    can_unresolve: false,
  };
  const RESOLVED = { state: "resolved", can_resolve: false, can_unresolve: true } as const;

  it("resolves on GitHub, then patches the cached comments", async () => {
    vi.mocked(getPrComments).mockResolvedValue({
      threads: [thread],
      conversation: [],
      truncated: false,
    });
    vi.mocked(setReviewThreadResolved).mockResolvedValue(RESOLVED);
    await fetchPRComments(pr());
    await expect(setPRThreadResolved(pr(), "T1", true)).resolves.toEqual(RESOLVED);
    expect(setReviewThreadResolved).toHaveBeenCalledWith({ threadId: "T1", resolved: true });
    // Reopening shows the new state without refetching.
    const after = await fetchPRComments(pr());
    expect(after.threads[0]).toMatchObject(RESOLVED);
    expect(getPrComments).toHaveBeenCalledTimes(1);
  });

  it("leaves the cache alone when GitHub refuses", async () => {
    vi.mocked(getPrComments).mockResolvedValue({
      threads: [thread],
      conversation: [],
      truncated: false,
    });
    vi.mocked(setReviewThreadResolved).mockRejectedValue(new Error("no permission"));
    await fetchPRComments(pr());
    await expect(setPRThreadResolved(pr(), "T1", true)).rejects.toThrow("no permission");
    expect((await fetchPRComments(pr())).threads[0].state).toBe("open");
  });
});

describe("mergePR", () => {
  it("merges with the method, pinned to the head the list loaded", async () => {
    await mergePR(pr(), OPTIONS, "REBASE");
    expect(mergePr).toHaveBeenCalledWith({
      pullRequestId: "PR_node",
      method: "REBASE",
      expectedHeadOid: "abc123",
    });
    expect(enqueuePr).not.toHaveBeenCalled();
  });

  it("adds the PR to the merge queue when its base branch has one", async () => {
    await mergePR(pr(), { ...OPTIONS, queue: true }, "SQUASH");
    expect(enqueuePr).toHaveBeenCalledWith({ pullRequestId: "PR_node", expectedHeadOid: "abc123" });
    expect(mergePr).not.toHaveBeenCalled();
  });
});

describe("approvePR", () => {
  it("approves the PR at the head the list loaded", async () => {
    await approvePR(pr({ user: { login: "author", avatar_url: "" } }));
    expect(approvePr).toHaveBeenCalledWith({
      owner: "o",
      repo: "app",
      number: 12,
      commitId: "abc123",
    });
  });
});

describe("fetchMyMergedPRs", () => {
  beforeEach(() => {
    clearListCache();
    vi.mocked(getMergedPrs).mockReset();
    vi.mocked(getMergedPrs).mockResolvedValue({
      prs: [pr({ merged_at: "2026-11-01T00:00:00Z" })],
    });
  });

  it("searches my PRs merged in the last 60 days, up to 100", async () => {
    const now = new Date("2026-11-04T12:00:00Z");
    await fetchMyMergedPRs(0, now);
    expect(getMergedPrs).toHaveBeenCalledWith({
      scope: "user",
      since: new Date(now.getTime() - MY_MERGED_DAYS * 86_400_000),
      first: 100,
    });
  });

  it("shares one search across callers under the same refreshKey", async () => {
    await fetchMyMergedPRs(0);
    await fetchMyMergedPRs(0);
    expect(getMergedPrs).toHaveBeenCalledTimes(1);
  });

  it("searches again once refreshKey moves on", async () => {
    await fetchMyMergedPRs(0);
    await fetchMyMergedPRs(1);
    expect(getMergedPrs).toHaveBeenCalledTimes(2);
  });

  it("searches again after 5 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
      await fetchMyMergedPRs(0);
      vi.setSystemTime(new Date("2026-11-04T12:05:00Z"));
      await fetchMyMergedPRs(0);
      expect(getMergedPrs).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries after a failed search", async () => {
    vi.mocked(getMergedPrs).mockRejectedValueOnce(new Error("down"));
    await expect(fetchMyMergedPRs(0)).rejects.toThrow("down");
    await fetchMyMergedPRs(0);
    expect(getMergedPrs).toHaveBeenCalledTimes(2);
  });

  it("forgets the list when settings change", async () => {
    await fetchMyMergedPRs(0);
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    await fetchMyMergedPRs(0);
    expect(getMergedPrs).toHaveBeenCalledTimes(2);
  });
});

describe("mergedSince", () => {
  it("keeps PRs merged at or after since", () => {
    const a = pr({ number: 1, merged_at: "2026-11-03T00:00:00Z" });
    const b = pr({ number: 2, merged_at: "2026-11-01T00:00:00Z" });
    const c = pr({ number: 3, merged_at: undefined });
    expect(mergedSince([a, b, c], new Date("2026-11-02T00:00:00Z"))).toEqual([a]);
    expect(mergedSince([a], new Date("2026-11-03T00:00:00Z"))).toEqual([a]);
  });
});
