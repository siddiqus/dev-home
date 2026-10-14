import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSeenTimer, SEEN_DWELL_MS } from "./useSeenTimer";

describe("useSeenTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock document.visibilityState as "visible" by default
    Object.defineProperty(document, "visibilityState", {
      writable: true,
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("calls onSeen after 1.5s when cardId is set and visible", () => {
    const onSeen = vi.fn();
    renderHook(() => useSeenTimer("card-1", onSeen));

    expect(onSeen).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SEEN_DWELL_MS);
    expect(onSeen).toHaveBeenCalledTimes(1);
  });

  it("does not call onSeen when cardId is null", () => {
    const onSeen = vi.fn();
    renderHook(() => useSeenTimer(null, onSeen));

    vi.advanceTimersByTime(SEEN_DWELL_MS);
    expect(onSeen).not.toHaveBeenCalled();
  });

  it("restarts timer when cardId changes", () => {
    const onSeen = vi.fn();
    const { rerender } = renderHook(({ cardId }) => useSeenTimer(cardId, onSeen), {
      initialProps: { cardId: "card-1" },
    });

    vi.advanceTimersByTime(SEEN_DWELL_MS - 100);
    expect(onSeen).not.toHaveBeenCalled();

    // Change card before timer completes
    rerender({ cardId: "card-2" });

    // Old timer should be cleared, advance 100ms doesn't trigger
    vi.advanceTimersByTime(100);
    expect(onSeen).not.toHaveBeenCalled();

    // New timer completes
    vi.advanceTimersByTime(SEEN_DWELL_MS - 100);
    expect(onSeen).toHaveBeenCalledTimes(1);
  });

  it("calls onSeen only once per card display", () => {
    const onSeen = vi.fn();
    renderHook(() => useSeenTimer("card-1", onSeen));

    vi.advanceTimersByTime(SEEN_DWELL_MS);
    expect(onSeen).toHaveBeenCalledTimes(1);

    // Advancing more time should not trigger again
    vi.advanceTimersByTime(SEEN_DWELL_MS);
    expect(onSeen).toHaveBeenCalledTimes(1);
  });

  it("does not call onSeen when document is hidden", () => {
    Object.defineProperty(document, "visibilityState", {
      writable: true,
      configurable: true,
      value: "hidden",
    });

    const onSeen = vi.fn();
    renderHook(() => useSeenTimer("card-1", onSeen));

    vi.advanceTimersByTime(SEEN_DWELL_MS);
    expect(onSeen).not.toHaveBeenCalled();
  });

  it("pauses timer when visibility changes to hidden and restarts when visible", () => {
    const onSeen = vi.fn();
    renderHook(() => useSeenTimer("card-1", onSeen));

    // Advance 500ms
    vi.advanceTimersByTime(500);
    expect(onSeen).not.toHaveBeenCalled();

    // Hide the document
    Object.defineProperty(document, "visibilityState", {
      writable: true,
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Advance more time while hidden - timer should be paused
    vi.advanceTimersByTime(SEEN_DWELL_MS);
    expect(onSeen).not.toHaveBeenCalled();

    // Make visible again
    Object.defineProperty(document, "visibilityState", {
      writable: true,
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Timer should restart from 0, need full 1500ms
    vi.advanceTimersByTime(SEEN_DWELL_MS);
    expect(onSeen).toHaveBeenCalledTimes(1);
  });

  it("clears timer when cardId becomes null", () => {
    const onSeen = vi.fn();
    const { rerender } = renderHook(({ cardId }) => useSeenTimer(cardId, onSeen), {
      initialProps: { cardId: "card-1" as string | null },
    });

    vi.advanceTimersByTime(SEEN_DWELL_MS - 100);
    expect(onSeen).not.toHaveBeenCalled();

    rerender({ cardId: null });
    vi.advanceTimersByTime(200);
    expect(onSeen).not.toHaveBeenCalled();
  });
});
