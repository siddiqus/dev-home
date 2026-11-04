import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api/jira/workday", () => ({
  getSprintTickets: vi.fn(),
  getOffSprintTickets: vi.fn(),
  getDoneSince: vi.fn(),
}));
vi.mock("../api/github", async (orig) => ({
  ...(await orig<typeof import("../api/github")>()),
  getMergedPrs: vi.fn(),
  getReviewedSince: vi.fn(),
}));
vi.mock("./github", async (orig) => ({
  ...(await orig<typeof import("./github")>()),
  fetchMyMergedPRs: vi.fn(),
}));

import * as jira from "../api/jira/workday";
import * as gh from "../api/github";
import { SETTINGS_EVENT } from "./config";
import { fetchMyMergedPRs } from "./github";
import {
  cachedWorkdaySince,
  cachedWorkdayStable,
  clearWorkdayCache,
  fetchWorkdayStable,
  fetchWorkdaySince,
  rememberWorkdaySince,
  rememberWorkdayStable,
} from "./workday";

describe("workday service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isolates failures per part", async () => {
    vi.mocked(jira.getSprintTickets).mockRejectedValue(new Error("sprint boom"));
    vi.mocked(jira.getOffSprintTickets).mockResolvedValue({ issues: [] });
    vi.mocked(fetchMyMergedPRs).mockResolvedValue([]);
    const stable = await fetchWorkdayStable(0);
    expect(stable.sprint).toEqual({ data: null, error: "sprint boom" });
    expect(stable.offSprint).toEqual({ data: [], error: null });
    expect(stable.ticketMerged).toEqual({ data: [], error: null });
  });

  it("reads the deck's merged PRs from the shared list, under the refreshKey", async () => {
    vi.mocked(jira.getSprintTickets).mockResolvedValue({ tickets: [] } as any);
    vi.mocked(jira.getOffSprintTickets).mockResolvedValue({ issues: [] });
    vi.mocked(fetchMyMergedPRs).mockRejectedValue(new Error("gh down"));
    const now = new Date("2026-10-14T12:00:00Z");
    const stable = await fetchWorkdayStable(3, undefined, now);
    expect(fetchMyMergedPRs).toHaveBeenCalledWith(3, now);
    expect(stable.ticketMerged).toEqual({ data: null, error: "gh down" });
  });

  it("passes since to the since-dependent fetches, and runs no merged search of its own", async () => {
    const since = new Date("2026-10-08T00:00:00Z");
    vi.mocked(jira.getDoneSince).mockResolvedValue({ tickets: [] });
    vi.mocked(gh.getReviewedSince).mockRejectedValue(new Error("gh down"));
    const res = await fetchWorkdaySince(since);
    expect(jira.getDoneSince).toHaveBeenCalledWith(since, undefined);
    expect(gh.getMergedPrs).not.toHaveBeenCalled();
    expect(res).toEqual({
      doneTickets: { data: [], error: null },
      reviewed: { data: null, error: "gh down" },
    });
  });
});

describe("workday cache", () => {
  const ok = <T>(data: T) => ({ data, error: null });
  const stable = { sprint: ok([]), offSprint: ok([]), ticketMerged: ok([]) };
  const sinceParts = { doneTickets: ok([]), reviewed: ok([]) };
  const since = new Date("2026-10-27T00:00:00Z");

  beforeEach(() => {
    clearWorkdayCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("reuses a loaded group for 5 minutes", () => {
    rememberWorkdayStable(3, stable);
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(cachedWorkdayStable(3)).toEqual(stable);
    vi.advanceTimersByTime(1);
    expect(cachedWorkdayStable(3)).toBeNull();
  });

  it("misses once refreshKey has moved on, even within 5 minutes", () => {
    rememberWorkdayStable(3, stable);
    expect(cachedWorkdayStable(4)).toBeNull();
  });

  it("doesn't keep a group with a failed part, so the next visit retries it", () => {
    rememberWorkdayStable(3, { ...stable, offSprint: { data: null, error: "jira down" } });
    expect(cachedWorkdayStable(3)).toBeNull();
  });

  it("keys the since group by its start date", () => {
    rememberWorkdaySince(since, 3, sinceParts);
    expect(cachedWorkdaySince(new Date(since), 3)).toEqual(sinceParts);
    expect(cachedWorkdaySince(new Date("2026-10-25T00:00:00Z"), 3)).toBeNull();
  });

  it("forgets everything when settings change", () => {
    rememberWorkdayStable(3, stable);
    rememberWorkdaySince(since, 3, sinceParts);
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    expect(cachedWorkdayStable(3)).toBeNull();
    expect(cachedWorkdaySince(since, 3)).toBeNull();
  });
});
