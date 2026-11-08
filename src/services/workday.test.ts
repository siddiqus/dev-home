import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api/jira/workday", () => ({
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
  sprintParts,
} from "./workday";
import type { JiraIssue } from "../types";

describe("workday service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isolates failures per part", async () => {
    vi.mocked(jira.getDoneSince).mockRejectedValue(new Error("jira boom"));
    vi.mocked(gh.getReviewedSince).mockResolvedValue({ reviews: [] });
    const res = await fetchWorkdaySince(new Date("2026-10-08T00:00:00Z"));
    expect(res.doneTickets).toEqual({ data: null, error: "jira boom" });
    expect(res.reviewed).toEqual({ data: [], error: null });
  });

  it("fetches only the shared merged list for the stable group, under the refreshKey", async () => {
    vi.mocked(fetchMyMergedPRs).mockRejectedValue(new Error("gh down"));
    const now = new Date("2026-10-14T12:00:00Z");
    const stable = await fetchWorkdayStable(3, now);
    expect(fetchMyMergedPRs).toHaveBeenCalledWith(3, now, {});
    expect(stable).toEqual({ ticketMerged: { data: null, error: "gh down" } });
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
  const stable = { ticketMerged: ok([]) };
  const sinceParts = { doneTickets: ok([]), reviewed: ok([]) };
  const since = new Date("2026-10-27T00:00:00Z");

  beforeEach(() => {
    clearWorkdayCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("reuses a loaded group however old it is, so opening Workday never refetches", () => {
    rememberWorkdayStable(3, stable);
    vi.advanceTimersByTime(3 * 60 * 60_000);
    expect(cachedWorkdayStable(3)).toEqual(stable);
  });

  it("misses once refreshKey has moved on", () => {
    rememberWorkdayStable(3, stable);
    expect(cachedWorkdayStable(4)).toBeNull();
  });

  it("doesn't keep a group with a failed part, so the next visit retries it", () => {
    rememberWorkdayStable(3, { ticketMerged: { data: null, error: "gh down" } });
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

describe("sprintParts", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  const issue = (key: string, over: Partial<JiraIssue> = {}): JiraIssue =>
    ({
      key,
      summary: key,
      status: { name: "To Do", statusCategory: { key: "new", colorName: "blue-gray" } },
      project: { key: "CCP", name: "CCP" },
      created: "2026-10-01T00:00:00Z",
      updated: "2026-11-01T00:00:00Z",
      codeReviewers: [],
      openSprint: null,
      points: null,
      flagged: false,
      ...over,
    }) as JiraIssue;

  it("reads as loading until the assigned list has fetched this session", () => {
    const parts = sprintParts(
      { issues: [issue("CCP-1", { openSprint: "Sprint 42" })], loaded: false, error: null },
      now,
    );
    expect(parts).toEqual({
      sprint: { data: null, error: null },
      offSprint: { data: null, error: null },
    });
  });

  it("carries the source's error while it hasn't loaded", () => {
    const parts = sprintParts({ issues: [], loaded: false, error: "jira down" }, now);
    expect(parts.sprint).toEqual({ data: null, error: "jira down" });
    expect(parts.offSprint).toEqual({ data: null, error: "jira down" });
  });

  it("splits tickets in an open sprint from the rest", () => {
    const inSprint = issue("CCP-1", {
      openSprint: "Sprint 42",
      points: 3,
      flagged: true,
      status: {
        name: "In Progress",
        statusCategory: { key: "indeterminate", colorName: "yellow" },
      },
    });
    const { sprint, offSprint } = sprintParts(
      { issues: [inSprint, issue("CCP-2")], loaded: true, error: null },
      now,
    );
    expect(sprint.data).toEqual([
      {
        key: "CCP-1",
        summary: "CCP-1",
        status: { name: "In Progress", categoryKey: "indeterminate" },
        sprintName: "Sprint 42",
        points: 3,
        flagged: true,
      },
    ]);
    expect(offSprint.data?.map((t) => [t.key, t.flagged])).toEqual([["CCP-2", false]]);
  });

  it("leaves out off-sprint tickets untouched for 60 days", () => {
    const { offSprint } = sprintParts(
      { issues: [issue("CCP-3", { updated: "2026-09-01T00:00:00Z" })], loaded: true, error: null },
      now,
    );
    expect(offSprint.data).toEqual([]);
  });

  it("reads as loading with no assigned source at all", () => {
    expect(sprintParts(undefined, now).sprint).toEqual({ data: null, error: null });
  });
});
