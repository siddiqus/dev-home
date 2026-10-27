import { describe, expect, it } from "vitest";
import { swipeOf } from "./useSwipe";

describe("swipeOf", () => {
  it.each([
    // [dx, dy, swipe]
    [-80, 10, "left"],
    [80, -10, "right"],
    [-50, 0, "left"],
    // A tap, or too short to mean it.
    [0, 0, null],
    [-49, 0, null],
    // Mostly vertical: scrolling the card, not a swipe.
    [-80, 70, null],
    [10, 200, null],
  ])("dx %i, dy %i → %s", (dx, dy, want) => {
    expect(swipeOf(dx, dy)).toBe(want);
  });
});
