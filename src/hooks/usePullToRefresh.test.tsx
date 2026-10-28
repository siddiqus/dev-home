import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderHook } from "@testing-library/react";
import {
  atTop,
  pullDistance,
  usePullToRefresh,
  PULL_MAX,
  PULL_THRESHOLD,
} from "./usePullToRefresh";

describe("pullDistance", () => {
  it.each([
    // [finger travel, indicator travel]
    [0, 0],
    [-40, 0],
    [60, 30],
    [PULL_THRESHOLD * 2, PULL_THRESHOLD],
    [1000, PULL_MAX],
  ])("dy %i → %i", (dy, want) => {
    expect(pullDistance(dy)).toBe(want);
  });
});

/** `root` > `scroller` > `leaf`, nothing scrolled. */
function tree() {
  const root = document.createElement("main");
  const scroller = document.createElement("div");
  const leaf = document.createElement("p");
  scroller.appendChild(leaf);
  root.appendChild(scroller);
  document.body.appendChild(root);
  return { root, scroller, leaf };
}

const scrollDown = (el: HTMLElement) => Object.defineProperty(el, "scrollTop", { value: 40 });

describe("atTop", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("holds when nothing up to the root is scrolled", () => {
    const { root, leaf } = tree();
    expect(atTop(leaf, root)).toBe(true);
  });

  it("fails when a container under the finger is scrolled down", () => {
    const { root, scroller, leaf } = tree();
    scrollDown(scroller);
    expect(atTop(leaf, root)).toBe(false);
  });

  it("fails when the root itself is scrolled down", () => {
    const { root, leaf } = tree();
    scrollDown(root);
    expect(atTop(leaf, root)).toBe(false);
  });
});

describe("usePullToRefresh", () => {
  let root: HTMLElement;
  let scroller: HTMLElement;
  let leaf: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ root, scroller, leaf } = tree());
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function setup(opts: { enabled?: boolean; refreshing?: boolean } = {}) {
    const onRefresh = vi.fn();
    const hook = renderHook(
      (props: { enabled: boolean; refreshing: boolean }) =>
        usePullToRefresh(root, { ...props, onRefresh }),
      { initialProps: { enabled: opts.enabled ?? true, refreshing: opts.refreshing ?? false } },
    );
    return { ...hook, onRefresh };
  }

  /** A one-finger drag on `el` by (dx, dy), in steps; returns each move's dispatch result. */
  function drag(el: HTMLElement, dx: number, dy: number, { release = true } = {}) {
    fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 100 }] });
    const results: boolean[] = [];
    for (const f of [0.1, 0.5, 1]) {
      const touch = { clientX: 100 + dx * f, clientY: 100 + dy * f };
      results.push(fireEvent.touchMove(el, { touches: [touch] }));
    }
    if (release) fireEvent.touchEnd(el, { changedTouches: [] });
    return results;
  }

  it("refreshes when a pull from the top goes past the threshold", () => {
    const { result, onRefresh } = setup();
    act(() => {
      drag(leaf, 0, PULL_THRESHOLD * 2 + 10);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("refreshing");
  });

  it("follows the finger while pulling, and holds the page still", () => {
    const { result, onRefresh } = setup();
    let moves: boolean[] = [];
    act(() => {
      moves = drag(leaf, 0, 100, { release: false });
    });
    expect(result.current).toEqual({ pull: 50, phase: "pulling" });
    // Every move was cancelled, so the browser neither scrolls nor bounces.
    expect(moves).toEqual([false, false, false]);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("springs back without refreshing when let go short of the threshold", () => {
    const { result, onRefresh } = setup();
    act(() => {
      drag(leaf, 0, PULL_THRESHOLD);
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current).toEqual({ pull: 0, phase: "idle" });
  });

  it("leaves a sideways swipe alone", () => {
    const { result, onRefresh } = setup();
    let moves: boolean[] = [];
    act(() => {
      moves = drag(leaf, -200, 60);
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
    expect(moves).toEqual([true, true, true]);
  });

  it("leaves an upward scroll alone", () => {
    const { onRefresh } = setup();
    let moves: boolean[] = [];
    act(() => {
      moves = drag(leaf, 0, -200);
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(moves).toEqual([true, true, true]);
  });

  it("scrolls instead when the content under the finger isn't at the top", () => {
    scrollDown(scroller);
    const { onRefresh } = setup();
    let moves: boolean[] = [];
    act(() => {
      moves = drag(leaf, 0, 300);
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(moves).toEqual([true, true, true]);
  });

  it("leaves text fields to themselves", () => {
    const input = document.createElement("textarea");
    scroller.appendChild(input);
    const { onRefresh } = setup();
    act(() => {
      drag(input, 0, 300);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const { onRefresh } = setup({ enabled: false });
    act(() => {
      drag(leaf, 0, 300);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does nothing while a refresh is already under way", () => {
    const { onRefresh } = setup({ refreshing: true });
    act(() => {
      drag(leaf, 0, 300);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("cancels the pull when a second finger lands", () => {
    const { result, onRefresh } = setup();
    act(() => {
      drag(leaf, 0, 300, { release: false });
      fireEvent.touchStart(leaf, {
        touches: [
          { clientX: 100, clientY: 400 },
          { clientX: 200, clientY: 400 },
        ],
      });
      fireEvent.touchEnd(leaf, { changedTouches: [] });
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current).toEqual({ pull: 0, phase: "idle" });
  });

  it("spins for a moment even when the refetch is instant", () => {
    const { result } = setup();
    act(() => {
      drag(leaf, 0, 300);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.phase).toBe("refreshing");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.phase).toBe("idle");
  });

  it("keeps spinning until the refetch finishes", () => {
    const { result, rerender } = setup();
    act(() => {
      drag(leaf, 0, 300);
    });
    rerender({ enabled: true, refreshing: true });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.phase).toBe("refreshing");
    rerender({ enabled: true, refreshing: false });
    expect(result.current.phase).toBe("idle");
  });

  it("doesn't spin for a refetch it didn't start", () => {
    const { result, rerender } = setup();
    rerender({ enabled: true, refreshing: true });
    expect(result.current.phase).toBe("idle");
  });
});
