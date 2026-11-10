import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import type { DeckTicket } from "./deckTypes";
import { MERGED_SEEN_KEY, useMergedSeen } from "./useMergedSeen";

const NOW = new Date("2026-10-14T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

/** A Merged recently tab whose PRs merged at the given times, newest first. */
const tab = (key: string, ...mergedAt: string[]): DeckTicket =>
  ({
    id: `merged:${key}`,
    prs: mergedAt.map((at) => ({ pr: { merged_at: at } })),
  }) as DeckTicket;

const seenAt = () => JSON.parse(localStorage.getItem(MERGED_SEEN_KEY) ?? "null");

describe("useMergedSeen", () => {
  beforeEach(() => localStorage.clear());

  it("counts nothing as new the first time, whatever merged in the last day", () => {
    const { result } = renderHook(() => useMergedSeen([tab("CCP-1", hoursAgo(3))], false, NOW));
    expect(result.current.hasNew).toBe(false);
    expect(seenAt()).toBe(NOW.getTime());
  });

  it("flags a merge after the last look, until the drawer opens", () => {
    localStorage.setItem(MERGED_SEEN_KEY, JSON.stringify(Date.parse(hoursAgo(5))));
    const merged = [tab("CCP-1", hoursAgo(3)), tab("CCP-2", hoursAgo(8))];
    const { result, rerender } = renderHook(({ open }) => useMergedSeen(merged, open, NOW), {
      initialProps: { open: false },
    });
    expect(result.current.hasNew).toBe(true);
    expect(result.current.newIds).toBeNull();

    rerender({ open: true });
    expect(result.current.hasNew).toBe(false);
    // The drawer still shows which tabs were new when it opened.
    expect([...result.current.newIds!]).toEqual(["merged:CCP-1"]);
    // Seen up to the newest merge on show, not the clock.
    expect(seenAt()).toBe(Date.parse(hoursAgo(3)));

    rerender({ open: false });
    expect(result.current.hasNew).toBe(false);
    expect(result.current.newIds).toBeNull();
  });

  it("goes by a tab's newest merge", () => {
    localStorage.setItem(MERGED_SEEN_KEY, JSON.stringify(Date.parse(hoursAgo(5))));
    const { result } = renderHook(() =>
      useMergedSeen([tab("CCP-1", hoursAgo(2), hoursAgo(9))], false, NOW),
    );
    expect(result.current.hasNew).toBe(true);
  });

  it("counts a merge that lands while the drawer is open as seen", () => {
    localStorage.setItem(MERGED_SEEN_KEY, JSON.stringify(Date.parse(hoursAgo(5))));
    const { result, rerender } = renderHook(
      ({ merged, open }) => useMergedSeen(merged, open, NOW),
      { initialProps: { merged: [] as DeckTicket[], open: true } },
    );
    rerender({ merged: [tab("CCP-1", hoursAgo(1))], open: true });
    rerender({ merged: [tab("CCP-1", hoursAgo(1))], open: false });
    expect(result.current.hasNew).toBe(false);
  });

  it("has nothing new without merged tabs", () => {
    localStorage.setItem(MERGED_SEEN_KEY, JSON.stringify(Date.parse(hoursAgo(5))));
    const { result } = renderHook(() => useMergedSeen([], false, NOW));
    expect(result.current.hasNew).toBe(false);
  });
});
