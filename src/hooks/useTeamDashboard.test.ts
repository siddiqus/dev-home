import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/teams", () => ({
  fetchTeamDashboard: vi.fn(),
  readCachedTeamDashboard: vi.fn(),
  cacheTeamDashboard: vi.fn(),
}));

import { cacheTeamDashboard, fetchTeamDashboard, readCachedTeamDashboard } from "../services/teams";
import { useTeamDashboard } from "./useTeamDashboard";
import dashboardFixture from "../views/teams/__fixtures__/dashboardFixture";
import type { TeamDashboard } from "../types/teams";

const named = (name: string): TeamDashboard => ({
  ...dashboardFixture,
  team: { ...dashboardFixture.team, name },
});

/** A fetch the test resolves by hand. */
function deferred() {
  let resolve!: (d: TeamDashboard) => void;
  const promise = new Promise<TeamDashboard>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(fetchTeamDashboard).mockReset();
  vi.mocked(readCachedTeamDashboard).mockReset().mockReturnValue(null);
  vi.mocked(cacheTeamDashboard).mockReset();
});

describe("useTeamDashboard", () => {
  it("shows a cached dashboard straight away, without fetching", () => {
    vi.mocked(readCachedTeamDashboard).mockReturnValue(named("cached"));
    const { result } = renderHook(() => useTeamDashboard(1, null));
    expect(result.current.dashboard?.team.name).toBe("cached");
    expect(result.current.loading).toBe(false);
    expect(fetchTeamDashboard).not.toHaveBeenCalled();
  });

  it("loads with no cards showing when nothing is cached, then caches the result", async () => {
    const d = deferred();
    vi.mocked(fetchTeamDashboard).mockReturnValue(d.promise);
    const { result } = renderHook(() => useTeamDashboard(1, 5));

    expect(result.current.dashboard).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(fetchTeamDashboard).toHaveBeenCalledWith(1, 5, { force: false });

    const fresh = named("fresh");
    await act(async () => d.resolve(fresh));
    expect(result.current.dashboard).toBe(fresh);
    expect(result.current.loading).toBe(false);
    expect(cacheTeamDashboard).toHaveBeenCalledWith(1, 5, fresh);
  });

  it("refresh clears the cards and refetches past the cache", async () => {
    vi.mocked(readCachedTeamDashboard).mockReturnValue(named("cached"));
    const { result } = renderHook(() => useTeamDashboard(1, null));

    const d = deferred();
    vi.mocked(fetchTeamDashboard).mockReturnValue(d.promise);
    act(() => result.current.refresh());

    expect(result.current.dashboard).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(fetchTeamDashboard).toHaveBeenCalledWith(1, null, { force: true });

    const fresh = named("fresh");
    await act(async () => d.resolve(fresh));
    expect(result.current.dashboard).toBe(fresh);
    expect(cacheTeamDashboard).toHaveBeenCalledWith(1, null, fresh);
  });

  it("switching sprint shows that sprint's cache, or clears and loads it", async () => {
    vi.mocked(readCachedTeamDashboard).mockImplementation((_team, sprint) =>
      sprint === 5 ? named("sprint 5") : null,
    );
    const d = deferred();
    vi.mocked(fetchTeamDashboard).mockReturnValue(d.promise);
    const { result, rerender } = renderHook(({ sprint }) => useTeamDashboard(1, sprint), {
      initialProps: { sprint: 5 as number | null },
    });
    expect(result.current.dashboard?.team.name).toBe("sprint 5");

    rerender({ sprint: 6 });
    expect(result.current.dashboard).toBeNull();
    expect(fetchTeamDashboard).toHaveBeenCalledWith(1, 6, { force: false });

    rerender({ sprint: 5 });
    expect(result.current.dashboard?.team.name).toBe("sprint 5");
    expect(result.current.loading).toBe(false);
    // The abandoned sprint-6 load must not overwrite what's on screen.
    await act(async () => d.resolve(named("sprint 6")));
    expect(result.current.dashboard?.team.name).toBe("sprint 5");
  });

  it("reports a failed load and keeps the cards cleared", async () => {
    vi.mocked(fetchTeamDashboard).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useTeamDashboard(1, null));
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.dashboard).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(cacheTeamDashboard).not.toHaveBeenCalled();
  });

  it("shows nothing without a team", () => {
    const { result } = renderHook(() => useTeamDashboard(null, null));
    expect(result.current.dashboard).toBeNull();
    expect(fetchTeamDashboard).not.toHaveBeenCalled();
  });
});
