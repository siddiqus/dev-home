import { describe, it, expect, vi, beforeEach } from "vitest";

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

import * as jira from "../api/jira/workday";
import * as gh from "../api/github";
import { fetchWorkdayStable, fetchWorkdaySince, TICKET_MERGED_DAYS } from "./workday";

describe("workday service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isolates failures per part", async () => {
    vi.mocked(jira.getSprintTickets).mockRejectedValue(new Error("sprint boom"));
    vi.mocked(jira.getOffSprintTickets).mockResolvedValue({ issues: [] });
    vi.mocked(gh.getMergedPrs).mockResolvedValue({ prs: [] });
    const stable = await fetchWorkdayStable();
    expect(stable.sprint).toEqual({ data: null, error: "sprint boom" });
    expect(stable.offSprint).toEqual({ data: [], error: null });
    expect(stable.ticketMerged).toEqual({ data: [], error: null });
  });

  it("fetches my merged PRs from the last TICKET_MERGED_DAYS for the deck's tickets", async () => {
    vi.mocked(jira.getSprintTickets).mockResolvedValue({ tickets: [] } as any);
    vi.mocked(jira.getOffSprintTickets).mockResolvedValue({ issues: [] });
    vi.mocked(gh.getMergedPrs).mockRejectedValue(new Error("gh down"));
    const now = new Date("2026-10-14T12:00:00Z");
    const stable = await fetchWorkdayStable(undefined, now);
    expect(gh.getMergedPrs).toHaveBeenCalledWith({
      scope: "user",
      since: new Date(now.getTime() - TICKET_MERGED_DAYS * 86_400_000),
      first: 100,
    });
    expect(stable.ticketMerged).toEqual({ data: null, error: "gh down" });
  });

  it("passes since to the since-dependent fetches", async () => {
    const since = new Date("2026-10-08T00:00:00Z");
    vi.mocked(jira.getDoneSince).mockResolvedValue({ tickets: [] });
    vi.mocked(gh.getMergedPrs).mockResolvedValue({ prs: [] });
    vi.mocked(gh.getReviewedSince).mockRejectedValue(new Error("gh down"));
    const res = await fetchWorkdaySince(since);
    expect(jira.getDoneSince).toHaveBeenCalledWith(since, undefined);
    expect(gh.getMergedPrs).toHaveBeenCalledWith({ scope: "user", since });
    expect(res.doneTickets.data).toEqual([]);
    expect(res.merged.data).toEqual([]);
    expect(res.reviewed).toEqual({ data: null, error: "gh down" });
  });
});
