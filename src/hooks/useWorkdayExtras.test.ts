import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/workday", async (orig) => ({
  ...(await orig<typeof import("../services/workday")>()),
  fetchWorkdayStable: vi.fn(),
  fetchWorkdaySince: vi.fn(),
}));

import { clearWorkdayCache, fetchWorkdaySince, fetchWorkdayStable } from "../services/workday";
import { useWorkdayExtras } from "./useWorkdayExtras";

const ok = <T>(data: T) => ({ data, error: null });
const since = new Date("2026-10-27T00:00:00Z");

beforeEach(() => {
  clearWorkdayCache();
  vi.mocked(fetchWorkdayStable).mockReset();
  vi.mocked(fetchWorkdaySince).mockReset();
  vi.mocked(fetchWorkdayStable).mockResolvedValue({
    sprint: ok([]),
    offSprint: ok([]),
    ticketMerged: ok([]),
  });
  vi.mocked(fetchWorkdaySince).mockResolvedValue({
    doneTickets: ok([]),
    merged: ok([]),
    reviewed: ok([]),
  });
});

/** Mounts the hook and waits for both groups to land. */
async function mountLoaded(refreshKey: number) {
  const hook = renderHook((key: number) => useWorkdayExtras(true, since, key), {
    initialProps: refreshKey,
  });
  await waitFor(() => {
    expect(hook.result.current.sprint.data).not.toBeNull();
    expect(hook.result.current.merged.data).not.toBeNull();
  });
  return hook;
}

describe("useWorkdayExtras", () => {
  it("shows the last load on a revisit within 5 minutes, without refetching", async () => {
    (await mountLoaded(0)).unmount();

    const { result } = renderHook(() => useWorkdayExtras(true, since, 0));

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
    renderHook(() => useWorkdayExtras(true, since, 1));
    await waitFor(() => expect(fetchWorkdayStable).toHaveBeenCalledTimes(2));
    expect(fetchWorkdaySince).toHaveBeenCalledTimes(2);
  });
});
