import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRecentTeams } from "./useRecentTeams";

const KEY = "dev-home-recent-teams";

beforeEach(() => localStorage.clear());

describe("useRecentTeams", () => {
  it("remembers visited teams across a reload", () => {
    const first = renderHook(() => useRecentTeams());
    act(() => first.result.current.visit(7));
    act(() => first.result.current.visit(3));
    first.unmount();

    const second = renderHook(() => useRecentTeams());
    expect(second.result.current.recent.map((t) => t.id)).toEqual([7, 3]);
  });

  it("starts empty when the saved list is corrupt", () => {
    localStorage.setItem(KEY, JSON.stringify({ not: "a list" }));
    const { result } = renderHook(() => useRecentTeams());
    expect(result.current.recent).toEqual([]);
  });

  it("skips malformed saved entries", () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 1, at: 5 }, { id: "x" }, null]));
    const { result } = renderHook(() => useRecentTeams());
    expect(result.current.recent).toEqual([{ id: 1, at: 5 }]);
  });
});
