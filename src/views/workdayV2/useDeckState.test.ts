import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDeckState, DECK_STATE_KEY } from "./useDeckState";
import type { DeckStateUpdates } from "./buildDeck";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("useDeckState persistence", () => {
  it("starts with empty state when localStorage is empty", () => {
    const { result } = renderHook(() => useDeckState());
    expect(result.current.state).toEqual({
      arrival: {},
      current: [],
      currentTickets: [],
      seen: {},
      closed: {},
      selected: null,
      seeded: false,
    });
  });

  it("round-trips state through localStorage", () => {
    const { result, rerender } = renderHook(() => useDeckState());
    act(() => {
      result.current.select("CCP-1");
      result.current.close("CCP-2", new Date("2026-10-14T10:00:00Z"));
    });
    rerender();
    const stored = JSON.parse(localStorage.getItem(DECK_STATE_KEY)!);
    expect(stored).toMatchObject({
      v: 1,
      selected: "CCP-1",
      closed: { "CCP-2": "2026-10-14T10:00:00.000Z" },
    });

    // Unmount and remount to simulate a page refresh
    const { result: result2 } = renderHook(() => useDeckState());
    expect(result2.current.state.selected).toBe("CCP-1");
    expect(result2.current.state.closed).toEqual({ "CCP-2": "2026-10-14T10:00:00.000Z" });
  });

  it("tolerates missing localStorage entry", () => {
    const { result } = renderHook(() => useDeckState());
    expect(result.current.state.seeded).toBe(false);
  });

  it("tolerates garbled JSON", () => {
    localStorage.setItem(DECK_STATE_KEY, "{invalid json");
    const { result } = renderHook(() => useDeckState());
    expect(result.current.state).toMatchObject({
      arrival: {},
      current: [],
      seeded: false,
    });
  });

  it("tolerates other-version JSON (missing v field)", () => {
    localStorage.setItem(DECK_STATE_KEY, JSON.stringify({ foo: "bar" }));
    const { result } = renderHook(() => useDeckState());
    expect(result.current.state).toMatchObject({
      arrival: {},
      seeded: false,
    });
  });

  it("tolerates wrong version number", () => {
    localStorage.setItem(DECK_STATE_KEY, JSON.stringify({ v: 99, arrival: { "CCP-1": 0 } }));
    const { result } = renderHook(() => useDeckState());
    expect(result.current.state.arrival).toEqual({});
  });
});

describe("useDeckState toggleCurrent", () => {
  it("appends a current item and its ticket to currentTickets", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.toggleCurrent("pr:https://github.com/o/repo/pull/1", "CCP-1");
    });
    expect(result.current.state.current).toEqual(["pr:https://github.com/o/repo/pull/1"]);
    expect(result.current.state.currentTickets).toEqual(["CCP-1"]);
  });

  it("maintains current order: newest at the bottom", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.toggleCurrent("pr:url1", "CCP-1");
      result.current.toggleCurrent("pr:url2", "CCP-2");
      result.current.toggleCurrent("pr:url3", "CCP-1");
    });
    expect(result.current.state.current).toEqual(["pr:url1", "pr:url2", "pr:url3"]);
    // CCP-1 was first, CCP-2 second
    expect(result.current.state.currentTickets).toEqual(["CCP-1", "CCP-2"]);
  });

  it("removes a current item when unmarked", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.toggleCurrent("pr:url1", "CCP-1");
      result.current.toggleCurrent("pr:url2", "CCP-1");
      result.current.toggleCurrent("pr:url1", "CCP-1"); // unmark
    });
    expect(result.current.state.current).toEqual(["pr:url2"]);
    expect(result.current.state.currentTickets).toEqual(["CCP-1"]);
  });

  it("removes the ticket from currentTickets when its last current item is unmarked", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.toggleCurrent("pr:url1", "CCP-1");
      result.current.toggleCurrent("pr:url2", "CCP-1");
      result.current.toggleCurrent("pr:url1", "CCP-1");
      result.current.toggleCurrent("pr:url2", "CCP-1");
    });
    expect(result.current.state.current).toEqual([]);
    expect(result.current.state.currentTickets).toEqual([]);
  });

  it("handles marking a ticket current (ticketless item)", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.toggleCurrent("ticket:CCP-1", "CCP-1");
    });
    expect(result.current.state.current).toEqual(["ticket:CCP-1"]);
    expect(result.current.state.currentTickets).toEqual(["CCP-1"]);
  });
});

describe("useDeckState markSeen", () => {
  it("records seen timestamps", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.markSeen({
        "https://github.com/o/repo/pull/1": "2026-10-14T10:00:00Z",
        "ticket:CCP-1": "2026-10-14T11:00:00Z",
      });
    });
    expect(result.current.state.seen).toEqual({
      "https://github.com/o/repo/pull/1": "2026-10-14T10:00:00Z",
      "ticket:CCP-1": "2026-10-14T11:00:00Z",
    });
  });

  it("never moves a timestamp backwards (monotonic)", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.markSeen({ "https://github.com/o/repo/pull/1": "2026-10-14T12:00:00Z" });
    });
    act(() => {
      result.current.markSeen({ "https://github.com/o/repo/pull/1": "2026-10-14T10:00:00Z" });
    });
    expect(result.current.state.seen["https://github.com/o/repo/pull/1"]).toBe(
      "2026-10-14T12:00:00Z",
    );
  });

  it("merges new entries with existing seen", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.markSeen({ url1: "2026-10-14T10:00:00Z" });
      result.current.markSeen({ url2: "2026-10-14T11:00:00Z" });
    });
    expect(result.current.state.seen).toEqual({
      url1: "2026-10-14T10:00:00Z",
      url2: "2026-10-14T11:00:00Z",
    });
  });
});

describe("useDeckState markUnread", () => {
  it("deletes the seen entry", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.markSeen({ "https://github.com/o/repo/pull/1": "2026-10-14T10:00:00Z" });
      result.current.markUnread("https://github.com/o/repo/pull/1");
    });
    expect(result.current.state.seen).toEqual({});
  });
});

describe("useDeckState close and reopen", () => {
  it("closes a ticket with a timestamp", () => {
    const { result } = renderHook(() => useDeckState());
    const at = new Date("2026-10-14T10:00:00Z");
    act(() => {
      result.current.close("CCP-1", at);
    });
    expect(result.current.state.closed).toEqual({ "CCP-1": "2026-10-14T10:00:00.000Z" });
  });

  it("uses current time when close called with no date", () => {
    const { result } = renderHook(() => useDeckState());
    const before = new Date().toISOString();
    act(() => {
      result.current.close("CCP-1");
    });
    const after = new Date().toISOString();
    const closed = result.current.state.closed["CCP-1"];
    expect(closed >= before && closed <= after).toBe(true);
  });

  it("reopens a ticket by deleting its closed entry", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.close("CCP-1", new Date("2026-10-14T10:00:00Z"));
      result.current.reopen("CCP-1");
    });
    expect(result.current.state.closed).toEqual({});
  });
});

describe("useDeckState select", () => {
  it("sets the selected ticket", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.select("CCP-1");
    });
    expect(result.current.state.selected).toBe("CCP-1");
  });

  it("clears selection when null", () => {
    const { result } = renderHook(() => useDeckState());
    act(() => {
      result.current.select("CCP-1");
      result.current.select(null);
    });
    expect(result.current.state.selected).toBeNull();
  });
});

describe("useDeckState applyUpdates", () => {
  it("merges new arrival entries", () => {
    const { result } = renderHook(() => useDeckState());
    const now = new Date("2026-10-14T12:00:00Z");
    const updates: DeckStateUpdates = {
      arrival: { "CCP-1": 0, "CCP-2": 1 },
    };
    act(() => {
      result.current.applyUpdates(updates, ["CCP-1", "CCP-2"], now);
    });
    expect(result.current.state.arrival).toEqual({ "CCP-1": 0, "CCP-2": 1 });
  });

  it("reopens closed tickets", () => {
    const { result } = renderHook(() => useDeckState());
    const now = new Date("2026-10-14T12:00:00Z");
    act(() => {
      result.current.close("CCP-1", new Date("2026-10-14T10:00:00Z"));
    });
    const updates: DeckStateUpdates = { reopen: ["CCP-1"] };
    act(() => {
      result.current.applyUpdates(updates, ["CCP-1"], now);
    });
    expect(result.current.state.closed).toEqual({});
  });

  it("prunes dropCurrent entries from current and currentTickets", () => {
    const { result } = renderHook(() => useDeckState());
    const now = new Date("2026-10-14T12:00:00Z");
    act(() => {
      result.current.toggleCurrent("pr:url1", "CCP-1");
      result.current.toggleCurrent("pr:url2", "CCP-1");
      result.current.toggleCurrent("pr:url3", "CCP-2");
    });
    const updates: DeckStateUpdates = {
      dropCurrent: ["pr:url1", "pr:url2"],
      dropCurrentTickets: ["CCP-1"],
    };
    act(() => {
      result.current.applyUpdates(updates, ["CCP-2"], now);
    });
    expect(result.current.state.current).toEqual(["pr:url3"]);
    expect(result.current.state.currentTickets).toEqual(["CCP-2"]);
  });

  it("seeds the seen map on first run", () => {
    const { result } = renderHook(() => useDeckState());
    const now = new Date("2026-10-14T12:00:00Z");
    const updates: DeckStateUpdates = {
      seen: { url1: "2026-10-14T10:00:00Z" },
      seeded: true,
    };
    act(() => {
      result.current.applyUpdates(updates, [], now);
    });
    expect(result.current.state.seen).toEqual({ url1: "2026-10-14T10:00:00Z" });
    expect(result.current.state.seeded).toBe(true);
  });

  it("prunes arrival entries absent for > 30 days", () => {
    const { result } = renderHook(() => useDeckState());
    const now = new Date("2026-10-14T12:00:00Z");
    // Seed arrival with old entries
    act(() => {
      result.current.applyUpdates(
        { arrival: { "CCP-1": 0, "CCP-2": 1, "CCP-3": 2 } },
        ["CCP-1", "CCP-2", "CCP-3"],
        new Date("2026-09-01T00:00:00Z"),
      );
    });
    // 30 days later, only CCP-1 is present
    const updates: DeckStateUpdates = {};
    act(() => {
      result.current.applyUpdates(updates, ["CCP-1"], now);
    });
    // CCP-2 and CCP-3 should be pruned (absent > 30 days)
    expect(result.current.state.arrival).toEqual({ "CCP-1": 0 });
  });

  it("does not change identity when empty updates are applied", () => {
    const { result } = renderHook(() => useDeckState());
    const now = new Date("2026-10-14T12:00:00Z");
    const stateBefore = result.current.state;
    act(() => {
      result.current.applyUpdates({}, [], now);
    });
    expect(result.current.state).toBe(stateBefore);
  });
});

describe("useDeckState batching", () => {
  it("writes to localStorage once per applyUpdates call", () => {
    const { result } = renderHook(() => useDeckState());
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const now = new Date("2026-10-14T12:00:00Z");
    const updates: DeckStateUpdates = {
      arrival: { "CCP-1": 0 },
      seen: { url1: "2026-10-14T10:00:00Z" },
      seeded: true,
    };
    act(() => {
      result.current.applyUpdates(updates, ["CCP-1"], now);
    });
    // Should be exactly 1 call to setItem after the state update (cleared spy after mount)
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith(DECK_STATE_KEY, expect.any(String));
  });

  it("batches multiple state changes into one write each", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useDeckState());
    setItemSpy.mockClear(); // Clear initial mount write
    act(() => {
      result.current.select("CCP-1");
    });
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.close("CCP-2");
    });
    expect(setItemSpy).toHaveBeenCalledTimes(2);
    act(() => {
      result.current.toggleCurrent("pr:url1", "CCP-1");
    });
    expect(setItemSpy).toHaveBeenCalledTimes(3);
  });
});
