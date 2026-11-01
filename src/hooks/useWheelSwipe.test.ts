import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderHook } from "@testing-library/react";
import { newGesture, trackWheel, useWheelSwipe } from "./useWheelSwipe";

describe("trackWheel", () => {
  it("swipes left once sideways travel passes the swipe distance", () => {
    const g = newGesture();
    expect(trackWheel(g, 20, 0, 0)).toBeNull();
    expect(trackWheel(g, 20, 0, 10)).toBeNull();
    expect(trackWheel(g, 20, 0, 20)).toBe("left");
  });

  it("swipes right on travel the other way", () => {
    const g = newGesture();
    expect(trackWheel(g, -60, 0, 0)).toBe("right");
  });

  it("makes one swipe per gesture, through a long steady run", () => {
    const g = newGesture();
    const swipes = [];
    for (let t = 0; t <= 1500; t += 16) swipes.push(trackWheel(g, 30, 0, t));
    expect(swipes.filter(Boolean)).toEqual(["left"]);
  });

  it("starts a new gesture after a quiet gap", () => {
    const g = newGesture();
    expect(trackWheel(g, 60, 0, 0)).toBe("left");
    expect(trackWheel(g, 60, 0, 100)).toBeNull();
    expect(trackWheel(g, -60, 0, 400)).toBe("right");
  });

  it("drops a short nudge's travel once it goes quiet", () => {
    const g = newGesture();
    expect(trackWheel(g, 40, 0, 0)).toBeNull();
    expect(trackWheel(g, 40, 0, 400)).toBeNull();
  });

  it("doesn't swipe on mostly vertical travel", () => {
    const g = newGesture();
    expect(trackWheel(g, 80, 70, 0)).toBeNull();
  });
});

describe("trackWheel on trackpad streams", () => {
  /** The swipes `deltas` make, one deltaX a frame with no quiet gap anywhere. */
  const swipes = (deltas: number[]) => {
    const g = newGesture();
    return deltas.map((dx, i) => trackWheel(g, dx, 0, i * 16)).filter(Boolean);
  };
  /** Fingers speeding up across the pad. */
  const stroke = [3, 10, 20, 30];
  /** Momentum after the fingers lift: slowing each frame, down to a 1px tail. */
  const glide = (from: number, frames: number) =>
    Array.from({ length: frames }, (_, i) => Math.max(1, Math.round(from * 0.95 ** (i + 1))));
  const back = (deltas: number[]) => deltas.map((d) => -d);

  it("makes one swipe through a long glide, rounding jitter included", () => {
    const tail = glide(30, 150).map((d, i) => (i % 7 === 0 ? d + 2 : d));
    expect(swipes([...stroke, ...tail])).toEqual(["left"]);
  });

  it("isn't fooled by one coalesced event in the glide", () => {
    const tail = glide(30, 80);
    tail[40] *= 3;
    expect(swipes([...stroke, ...tail])).toEqual(["left"]);
  });

  it("makes one swipe for a flick still speeding up when it swipes", () => {
    expect(swipes([10, 45, 100, 150, 150, ...glide(150, 100)])).toEqual(["left"]);
  });

  it("swipes again on a new swipe during the glide", () => {
    const again = [2, 6, 14, 25, 35];
    expect(swipes([...stroke, ...glide(30, 15), ...again, ...glide(35, 60)])).toEqual([
      "left",
      "left",
    ]);
  });

  it("swipes back on a swipe the other way during the glide", () => {
    const backAgain = back([2, 6, 14, 25, 35]);
    expect(swipes([...stroke, ...glide(30, 15), ...backAgain, ...back(glide(35, 60))])).toEqual([
      "left",
      "right",
    ]);
  });

  it("keeps up with three quick swipes in a row", () => {
    const again = [2, 6, 14, 25, 35];
    const deltas = [...stroke, ...glide(30, 12), ...again, ...glide(35, 12), ...again];
    expect(swipes([...deltas, ...glide(35, 60)])).toEqual(["left", "left", "left"]);
  });
});

describe("useWheelSwipe", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const mount = (enabled = true) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const onSwipe = vi.fn();
    renderHook(() => useWheelSwipe(el, onSwipe, enabled));
    return { el, onSwipe };
  };

  it("fires once per gesture, and keeps sideways wheeling from the browser", () => {
    const { el, onSwipe } = mount();
    // fireEvent returns false when the event's default was prevented.
    expect(fireEvent.wheel(el, { deltaX: 40 })).toBe(false);
    expect(fireEvent.wheel(el, { deltaX: 40 })).toBe(false);
    expect(fireEvent.wheel(el, { deltaX: 40 })).toBe(false);
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith("left");
  });

  it("leaves vertical wheeling to scroll", () => {
    const { el, onSwipe } = mount();
    expect(fireEvent.wheel(el, { deltaX: 5, deltaY: 80 })).toBe(true);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("does nothing while disabled", () => {
    const { el, onSwipe } = mount(false);
    expect(fireEvent.wheel(el, { deltaX: 80 })).toBe(true);
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
