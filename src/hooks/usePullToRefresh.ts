import { useEffect, useRef, useState } from "react";
import { isTypingTarget } from "../utils/dom";

/** Indicator travel, in px, past which letting go refreshes. */
export const PULL_THRESHOLD = 64;
/** The furthest the indicator travels. */
export const PULL_MAX = 96;
/** Finger travel, in px, before a touch is read as a pull or not. */
const SLOP = 10;
/** The shortest spin, so a quick refetch still reads as one. */
const MIN_SPIN_MS = 600;

export type PullPhase = "idle" | "pulling" | "refreshing";

/** Indicator travel for the finger's downward travel: half of it, up to PULL_MAX. */
export function pullDistance(dy: number): number {
  return Math.min(PULL_MAX, Math.max(0, dy) / 2);
}

/**
 * Whether a touch on `target` can start a pull: nothing between it and `root`
 * is scrolled down, so dragging down has nothing left to scroll.
 */
export function atTop(target: EventTarget | null, root: HTMLElement): boolean {
  for (let n = target instanceof Element ? target : null; n; n = n.parentElement) {
    if (n.scrollTop > 0) return false;
    if (n === root) return true;
  }
  return false;
}

/**
 * Pull to refresh on `root`: a one-finger drag down from the top calls
 * `onRefresh` once let go past PULL_THRESHOLD. Sideways swipes, upward
 * scrolls, scrolled-down content and text fields are left alone, and so are
 * overlays portaled outside `root`. After a pull the phase stays "refreshing"
 * for a moment, then for as long as `refreshing` holds.
 */
export function usePullToRefresh(
  root: HTMLElement | null,
  opts: { enabled: boolean; refreshing: boolean; onRefresh: () => void },
): { pull: number; phase: PullPhase } {
  const { enabled, refreshing, onRefresh } = opts;
  const [pull, setPull] = useState(0);
  // A pull's spin: its shortest run ("min"), then until the refetch is done ("wait").
  const [spin, setSpin] = useState<"off" | "min" | "wait">("off");

  // Read through a ref so the listeners aren't re-bound on every render.
  const latest = useRef({ onRefresh, busy: false });
  latest.current = { onRefresh, busy: refreshing || spin !== "off" };

  useEffect(() => {
    if (!root || !enabled) return;
    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let distance = 0;

    const reset = () => {
      start = null;
      pulling = false;
      distance = 0;
      setPull(0);
    };

    const onStart = (e: TouchEvent) => {
      reset();
      const t = e.touches[0];
      // A second finger (a pinch) cancels the pull.
      if (e.touches.length !== 1 || !t || latest.current.busy) return;
      if (isTypingTarget(e.target) || !atTop(e.target, root)) return;
      start = { x: t.clientX, y: t.clientY };
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!pulling) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) {
          // Hold the page still while a pull may be starting, so the browser's
          // own bounce or pull-to-refresh can't begin underneath ours.
          if (dy > Math.abs(dx) && e.cancelable) e.preventDefault();
          return;
        }
        // Mostly sideways (a deck swipe) or upward (a scroll): not a pull.
        if (dy <= Math.abs(dx)) {
          start = null;
          return;
        }
        pulling = true;
      }
      if (e.cancelable) e.preventDefault();
      distance = pullDistance(dy);
      setPull(distance);
    };

    const onEnd = () => {
      const fire = pulling && distance >= PULL_THRESHOLD;
      reset();
      if (!fire) return;
      setSpin("min");
      latest.current.onRefresh();
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", reset);
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", reset);
      setPull(0);
    };
  }, [root, enabled]);

  useEffect(() => {
    if (spin !== "min") return;
    const id = setTimeout(() => setSpin("wait"), MIN_SPIN_MS);
    return () => clearTimeout(id);
  }, [spin]);

  useEffect(() => {
    if (spin === "wait" && !refreshing) setSpin("off");
  }, [spin, refreshing]);

  const phase: PullPhase = spin !== "off" ? "refreshing" : pull > 0 ? "pulling" : "idle";
  return { pull, phase };
}
