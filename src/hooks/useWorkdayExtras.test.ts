import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GitHubPR, JiraIssue } from "../types";

vi.mock("../services/workday", async (orig) => ({
  ...(await orig<typeof import("../services/workday")>()),
  fetchWorkdayStable: vi.fn(),
  fetchWorkdaySince: vi.fn(),
}));

import { clearWorkdayCache, fetchWorkdaySince, fetchWorkdayStable } from "../services/workday";
import { useWorkdayExtras } from "./useWorkdayExtras";

const ok = <T>(data: T) => ({ data, error: null });
const since = new Date("2026-10-27T00:00:00Z");
const noneAssigned = { issues: [] as JiraIssue[], loaded: true, error: null };

beforeEach(() => {
  clearWorkdayCache();
  vi.mocked(fetchWorkdayStable).mockReset();
  vi.mocked(fetchWorkdaySince).mockReset();
  vi.mocked(fetchWorkdayStable).mockResolvedValue({
    ticketMerged: ok([]),
  });
  vi.mocked(fetchWorkdaySince).mockResolvedValue({
    doneTickets: ok([]),
    reviewed: ok([]),
  });
});

/** Mounts the hook and waits for both groups to land. */
async function mountLoaded(refreshKey: number) {
  const hook = renderHook(
    (key: number) =>
      useWorkdayExtras(true, since, key, { needsDone: true, assigned: noneAssigned }),
    {
      initialProps: refreshKey,
    },
  );
  await waitFor(() => {
    expect(hook.result.current.sprint.data).not.toBeNull();
    expect(hook.result.current.merged.data).not.toBeNull();
  });
  return hook;
}

describe("useWorkdayExtras", () => {
  it("shows the last load on a revisit within 5 minutes, without refetching", async () => {
    (await mountLoaded(0)).unmount();

    const { result } = renderHook(() =>
      useWorkdayExtras(true, since, 0, { needsDone: true, assigned: noneAssigned }),
    );

    // Data on the very first render: no loading skeletons on the way back.
    expect(result.current.sprint.data).toEqual([]);
    expect(result.current.merged.data).toEqual([]);
    expect(fetchWorkdayStable).toHaveBeenCalledTimes(1);
    expect(fetchWorkdaySince).toHaveBeenCalledTimes(1);
  });

  it("refetches when refreshKey bumps while mounted", async () => {
    const { rerender } = await mountLoaded(0);
    rerender(1);
    await waitFor(() => expect(fetchWorkdayStable).toHaveBeenCalledTimes(2));
    expect(fetchWorkdaySince).toHaveBeenCalledTimes(2);
  });

  it("refetches on a revisit after a refresh elsewhere, e.g. a merge from My PRs", async () => {
    (await mountLoaded(0)).unmount();
    renderHook(() => useWorkdayExtras(true, since, 1, { needsDone: true }));
    await waitFor(() => expect(fetchWorkdayStable).toHaveBeenCalledTimes(2));
    expect(fetchWorkdaySince).toHaveBeenCalledTimes(2);
  });

  it("derives Merged recently from the ticket list by since, with no request of its own", async () => {
    vi.mocked(fetchWorkdayStable).mockResolvedValue({
      ticketMerged: ok([
        { number: 1, merged_at: "2026-10-28T09:00:00Z" },
        { number: 2, merged_at: "2026-10-20T09:00:00Z" },
      ] as GitHubPR[]),
    });
    const { result, rerender } = renderHook(
      (s: Date) => useWorkdayExtras(true, s, 0, { needsDone: true, assigned: noneAssigned }),
      {
        initialProps: since,
      },
    );
    await waitFor(() => expect(result.current.merged.data?.map((p) => p.number)).toEqual([1]));
    rerender(new Date("2026-10-19T00:00:00Z"));
    expect(result.current.merged.data?.map((p) => p.number)).toEqual([1, 2]);
    expect(fetchWorkdayStable).toHaveBeenCalledTimes(1);
  });

  it("leaves the done-since parts unfetched while Focus or List is showing", async () => {
    const { result } = renderHook(() =>
      useWorkdayExtras(true, since, 0, { needsDone: false, assigned: noneAssigned }),
    );
    await waitFor(() => expect(result.current.ticketMerged.data).not.toBeNull());
    expect(fetchWorkdaySince).not.toHaveBeenCalled();
    expect(result.current.doneTickets).toEqual({ data: null, error: null });
  });

  it("fetches the done-since parts once Standup opens", async () => {
    const { result, rerender } = renderHook(
      (needsDone: boolean) =>
        useWorkdayExtras(true, since, 0, { needsDone, assigned: noneAssigned }),
      { initialProps: false },
    );
    await waitFor(() => expect(result.current.ticketMerged.data).not.toBeNull());
    rerender(true);
    await waitFor(() => expect(result.current.doneTickets.data).toEqual([]));
    expect(fetchWorkdaySince).toHaveBeenCalledTimes(1);
  });

  it("splits sprint and off-sprint from the assigned list instead of fetching them", () => {
    const assigned = {
      issues: [
        {
          key: "CCP-1",
          summary: "One",
          status: { name: "To Do", statusCategory: { key: "new", colorName: "" } },
          updated: new Date().toISOString(),
          openSprint: "Sprint 42",
        } as JiraIssue,
      ],
      loaded: true,
      error: null,
    };
    const { result } = renderHook(() =>
      useWorkdayExtras(true, since, 0, { needsDone: false, assigned }),
    );
    expect(result.current.sprint.data?.map((t) => t.key)).toEqual(["CCP-1"]);
    expect(result.current.offSprint.data).toEqual([]);
  });
});
