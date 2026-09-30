import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFocusState, setDismiss, setPin, setSnooze } from "./focusApi";

const DAY = 24 * 60 * 60 * 1000;

describe("focus state (localStorage)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("upserts pin, snooze and dismiss independently", async () => {
    await setPin("a", true);
    await setSnooze("a", Date.now() + DAY);
    await setDismiss("b", true);
    const items = await fetchFocusState();
    expect(items).toEqual(
      expect.arrayContaining([
        { itemId: "a", pinnedAt: Date.now(), snoozedUntil: Date.now() + DAY, dismissedAt: null },
        { itemId: "b", pinnedAt: null, snoozedUntil: null, dismissedAt: Date.now() },
      ]),
    );
    await setPin("a", false);
    expect((await fetchFocusState()).find((i) => i.itemId === "a")?.pinnedAt).toBeNull();
  });

  it("garbage-collects stale inactive rows after 90 days", async () => {
    await setSnooze("old", Date.now() + DAY);
    await setPin("kept", true);
    vi.setSystemTime(Date.now() + 91 * DAY);
    const ids = (await fetchFocusState()).map((i) => i.itemId);
    expect(ids).toEqual(["kept"]);
  });

  it("validates input", async () => {
    await expect(setPin("", true)).rejects.toThrow();
    await expect(setSnooze("a", Number.NaN)).rejects.toThrow();
  });
});
