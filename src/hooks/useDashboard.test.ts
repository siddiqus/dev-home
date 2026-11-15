import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { saveSettings, loadSettings } from "../services/config";

vi.mock("../services/jira", () => ({
  fetchAssignedIssues: vi.fn(),
  fetchIssuesByKeys: vi.fn(),
  fetchRecentMentions: vi.fn(),
}));
vi.mock("../services/github", () => ({
  fetchOpenPRs: vi.fn(),
  fetchReviewRequests: vi.fn(),
  fetchMentions: vi.fn(),
}));

import { fetchAssignedIssues, fetchIssuesByKeys } from "../services/jira";
import { fetchOpenPRs, fetchReviewRequests, fetchMentions } from "../services/github";
import { useDashboard } from "./useDashboard";

const issue = (key: string) => ({ key, summary: key }) as any;
const pr = (n: number, title: string) =>
  ({ number: n, title, repo_full_name: "o/r", head: { ref: "" }, body: "" }) as any;

const SETTINGS = {
  jiraBaseUrl: "https://x.atlassian.net",
  jiraEmail: "me@x.com",
  jiraApiToken: "t",
  githubToken: "g",
  githubUsername: "me",
  githubOrg: "",
  hiddenTabs: [],
};

beforeEach(() => {
  localStorage.clear();
  saveSettings(SETTINGS);
  vi.mocked(fetchAssignedIssues)
    .mockReset()
    .mockResolvedValue([issue("AA-1")]);
  vi.mocked(fetchIssuesByKeys)
    .mockReset()
    .mockImplementation(async (keys: string[]) => keys.map(issue));
  vi.mocked(fetchOpenPRs)
    .mockReset()
    .mockResolvedValue([pr(1, "AA-1 mine"), pr(2, "BB-2 other")]);
  vi.mocked(fetchReviewRequests)
    .mockReset()
    .mockResolvedValue({ reviews: [pr(3, "CC-3 review")], reviewing: [] });
  vi.mocked(fetchMentions).mockReset().mockResolvedValue([]);
});

describe("useDashboard enrichment", () => {
  it("adds PR-referenced issues to jiraIssues but not assignedJiraIssues, without duplicates", async () => {
    const { result } = renderHook(() => useDashboard(true));
    act(() => result.current.ensure(["jiraIssues", "openPRs"]));
    await waitFor(() =>
      expect(result.current.jiraIssues.map((i) => i.key)).toEqual(["AA-1", "BB-2"]),
    );
    expect(result.current.assignedJiraIssues.map((i) => i.key)).toEqual(["AA-1"]);
    expect(fetchIssuesByKeys).toHaveBeenCalledWith(["BB-2"], { withDetail: false });

    // Refreshing assigned issues re-fetches extras but never duplicates them.
    act(() => result.current.refresh(["jiraIssues"]));
    await waitFor(() => expect(fetchIssuesByKeys).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.jiraIssuesLoading).toBe(false));
    expect(result.current.jiraIssues.map((i) => i.key)).toEqual(["AA-1", "BB-2"]);

    // Refreshing PRs alone doesn't re-request extras already held.
    act(() => result.current.refresh(["openPRs"]));
    await waitFor(() => expect(result.current.openPRsLoading).toBe(false));
    expect(fetchIssuesByKeys).toHaveBeenCalledTimes(2);
  });

  it("enriches from review requests when My PRs hasn't loaded (Reviews tab)", async () => {
    const { result } = renderHook(() => useDashboard(true));
    act(() => result.current.ensure(["reviewRequests", "jiraIssues"]));
    await waitFor(() => expect(result.current.jiraIssues.map((i) => i.key)).toContain("CC-3"));
  });
});

describe("useDashboard lifecycle", () => {
  it("reports loaded sources only after a real fetch", async () => {
    const { result } = renderHook(() => useDashboard(true));
    expect(result.current.loadedSources.size).toBe(0);
    act(() => result.current.ensure(["openPRs"]));
    await waitFor(() => expect(result.current.loadedSources.has("openPRs")).toBe(true));
  });

  it("drops data and refetches when credentials change, but not on UI-only changes", async () => {
    const { result } = renderHook(() => useDashboard(true));
    act(() => result.current.ensure(["openPRs"]));
    await waitFor(() => expect(result.current.openPRs).toHaveLength(2));
    expect(fetchOpenPRs).toHaveBeenCalledTimes(1);

    act(() => saveSettings({ ...loadSettings(), hiddenTabs: ["notes"] }));
    expect(fetchOpenPRs).toHaveBeenCalledTimes(1);

    vi.mocked(fetchOpenPRs).mockResolvedValue([pr(9, "other user")]);
    act(() => saveSettings({ ...loadSettings(), githubUsername: "someone-else" }));
    expect(result.current.openPRs).toEqual([]);
    await waitFor(() => expect(result.current.openPRs.map((p) => p.number)).toEqual([9]));
  });

  it("ignores a cache written for another account", async () => {
    const { result, unmount } = renderHook(() => useDashboard(true));
    act(() => result.current.ensure(["openPRs"]));
    await waitFor(() => expect(result.current.openPRs).toHaveLength(2));
    unmount();

    localStorage.setItem(
      "dev-home-settings",
      JSON.stringify({ ...SETTINGS, githubUsername: "someone-else" }),
    );
    const { result: next } = renderHook(() => useDashboard(true));
    expect(next.current.openPRs).toEqual([]);
  });

  it("refetches on refocus only when data is older than the poll interval", async () => {
    const { result } = renderHook(() => useDashboard(true));
    act(() => result.current.ensure(["openPRs"]));
    await waitFor(() => expect(result.current.loadedSources.has("openPRs")).toBe(true));

    const setVisibility = (v: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    expect(fetchOpenPRs).toHaveBeenCalledTimes(1);
    expect(result.current.pollKey).toBe(0);

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 11 * 60 * 1000);
    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    expect(fetchOpenPRs).toHaveBeenCalledTimes(2);
    // The catch-up counts as a poll, so an open Workday refreshes its own lists.
    expect(result.current.pollKey).toBe(1);
    vi.restoreAllMocks();
  });

  it("bumps pollKey on each polling interval, and not on a manual refresh", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const { result } = renderHook(() => useDashboard(true));
      // waitFor polls with setInterval, which is faked here: flush promises instead.
      await act(async () => result.current.ensure(["openPRs"]));
      expect(result.current.loadedSources.has("openPRs")).toBe(true);

      await act(async () => result.current.refresh(["openPRs"]));
      expect(result.current.pollKey).toBe(0);

      await act(async () => vi.advanceTimersByTime(10 * 60 * 1000));
      expect(result.current.pollKey).toBe(1);
      expect(fetchOpenPRs).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useDashboard patchPR", () => {
  const listed = (n: number, extra: object = {}) =>
    ({
      ...pr(n, `PR ${n}`),
      html_url: `https://github.com/o/r/pull/${n}`,
      state: "open",
      ...extra,
    }) as any;

  beforeEach(() => {
    vi.mocked(fetchOpenPRs).mockResolvedValue([listed(1), listed(2)]);
    vi.mocked(fetchReviewRequests).mockResolvedValue({
      reviews: [listed(3, { viewer_engaged: true }), listed(4)],
      reviewing: [listed(3)],
    });
  });

  async function loaded() {
    const hook = renderHook(() => useDashboard(true));
    act(() => hook.result.current.ensure(["openPRs", "reviewRequests"]));
    await waitFor(() => expect(hook.result.current.loadedSources.size).toBe(2));
    return hook;
  }

  it("swaps the PR into every list it's in, leaving the rest and refreshKey alone", async () => {
    const { result } = await loaded();
    const key = result.current.refreshKey;
    act(() => result.current.patchPR(listed(3, { title: "fresh", viewer_engaged: false })));

    expect(result.current.reviewRequests.map((p) => p.title)).toEqual(["fresh", "PR 4"]);
    expect(result.current.reviewingPRs.map((p) => p.title)).toEqual(["fresh"]);
    expect(result.current.openPRs.map((p) => p.title)).toEqual(["PR 1", "PR 2"]);
    // Engagement isn't undone by the refresh's narrower view of it.
    expect(result.current.reviewRequests[0].viewer_engaged).toBe(true);
    expect(result.current.refreshKey).toBe(key);
    expect(fetchOpenPRs).toHaveBeenCalledTimes(1);
    expect(fetchReviewRequests).toHaveBeenCalledTimes(1);
  });

  it("keeps the swap across a reload, from the cache", async () => {
    const { result } = await loaded();
    act(() => result.current.patchPR(listed(2, { title: "fresh" })));
    const reloaded = renderHook(() => useDashboard(true)).result;
    expect(reloaded.current.openPRs.map((p) => p.title)).toEqual(["PR 1", "fresh"]);
  });

  it("leaves the lists alone for a PR that's no longer open", async () => {
    const { result } = await loaded();
    act(() => result.current.patchPR(listed(2, { title: "merged", state: "merged" })));
    expect(result.current.openPRs.map((p) => p.title)).toEqual(["PR 1", "PR 2"]);
  });
});
