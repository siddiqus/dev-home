import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GitHubPR, PRComments, PRReviewThread } from "../types";
import {
  approvePr,
  enqueuePr,
  getMergeOptions,
  getMergedPrs,
  getPrBody,
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
  fetchPRBody,
  fetchPRComments,
  refreshPRBodyImages,
  refreshPRCommentImages,
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
  getPrBody: vi.fn(),
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
  vi.mocked(getPrBody).mockReset();
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

describe("fetchPRBody", () => {
  const SIGNED = "![a](https://private-user-images.githubusercontent.com/1/2-x.png?jwt=t)";

  it("reuses a plain body for the session", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getPrBody).mockResolvedValue("plain");
      await fetchPRBody(pr());
      vi.advanceTimersByTime(60 * 60 * 1000);
      await expect(fetchPRBody(pr())).resolves.toBe("plain");
      expect(getPrBody).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refetches a body with signed image URLs before they expire", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getPrBody).mockResolvedValue(SIGNED);
      await fetchPRBody(pr());
      vi.advanceTimersByTime(3 * 60 * 1000);
      await fetchPRBody(pr());
      expect(getPrBody).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60 * 1000 + 1);
      await fetchPRBody(pr());
      expect(getPrBody).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("refreshPRBodyImages", () => {
  const SIGNED = "![a](https://private-user-images.githubusercontent.com/1/2-x.png?jwt=t)";

  it("refetches only once the signed URLs may have expired", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getPrBody).mockResolvedValue(SIGNED);
      await fetchPRBody(pr());
      // A broken image this early isn't an expired one: nothing to refetch.
      expect(refreshPRBodyImages(pr())).toBeNull();
      vi.advanceTimersByTime(4 * 60 * 1000 + 1);
      await expect(refreshPRBodyImages(pr())).resolves.toBe(SIGNED);
      expect(getPrBody).toHaveBeenCalledTimes(2);
      // The refetched body is fresh again.
      expect(refreshPRBodyImages(pr())).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never refetches a body without signed URLs", async () => {
    vi.mocked(getPrBody).mockResolvedValue("plain");
    await fetchPRBody(pr());
    expect(refreshPRBodyImages(pr())).toBeNull();
  });

  it("fetches a body that was never cached (it came with the PR)", async () => {
    vi.mocked(getPrBody).mockResolvedValue(SIGNED);
    await expect(refreshPRBodyImages(pr({ body: "inline" }))).resolves.toBe(SIGNED);
    expect(refreshPRBodyImages(pr({ body: "inline" }))).toBeNull();
  });
});

describe("refreshPRCommentImages", () => {
  it("refetches comments only once their signed URLs may have expired", async () => {
    const author = { login: "bob", avatar_url: "", is_bot: false };
    const signed: PRComments = {
      threads: [],
      truncated: false,
      conversation: [
        {
          kind: "comment",
          id: "c1",
          author,
          body: "![a](https://private-user-images.githubusercontent.com/1/2-x.png?jwt=t)",
          created_at: "T1",
          html_url: "",
        },
      ],
    };
    vi.useFakeTimers();
    try {
      vi.mocked(getPrComments).mockResolvedValue(signed);
      await fetchPRComments(pr());
      expect(refreshPRCommentImages(pr())).toBeNull();
      vi.advanceTimersByTime(4 * 60 * 1000 + 1);
      await expect(refreshPRCommentImages(pr())).resolves.toBe(signed);
      expect(getPrComments).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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

  it("refetches comments with signed image URLs before they expire", async () => {
    const author = { login: "bob", avatar_url: "", is_bot: false };
    const signed: PRComments = {
      ...COMMENTS,
      conversation: [
        {
          kind: "comment",
          id: "c1",
          author,
          body: "![a](https://private-user-images.githubusercontent.com/1/2-x.png?jwt=t)",
          created_at: "T1",
          html_url: "",
        },
      ],
    };
    vi.useFakeTimers();
    try {
      vi.mocked(getPrComments).mockResolvedValue(signed);
      await fetchPRComments(pr());
      vi.advanceTimersByTime(3 * 60 * 1000);
      await fetchPRComments(pr());
      expect(getPrComments).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60 * 1000 + 1);
      await fetchPRComments(pr());
      expect(getPrComments).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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

  it("keeps the list however old it is, until a forced (polling) search", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
      await fetchMyMergedPRs(0);
      vi.setSystemTime(new Date("2026-11-04T15:00:00Z"));
      await fetchMyMergedPRs(0);
      expect(getMergedPrs).toHaveBeenCalledTimes(1);
      await fetchMyMergedPRs(0, new Date(), { force: true });
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
