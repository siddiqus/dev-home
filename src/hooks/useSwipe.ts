import { useRef, type TouchEvent } from "react";
import { isTypingTarget } from "../utils/dom";

export type Swipe = "left" | "right";

/** Sideways travel, in px, before a touch counts as a swipe. */
const MIN_DISTANCE = 50;

/**
 * The swipe a touch made, from its travel: far enough and mostly sideways.
 * A tap or a vertical scroll is no swipe.
 */
export function swipeOf(dx: number, dy: number): Swipe | null {
  if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) <= Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "left" : "right";
}

/**
 * Touch handlers to spread on an element: `onSwipe` fires once per one-finger
 * swipe. Touches that start in a text field are left to it.
 */
export function useSwipe(onSwipe: (swipe: Swipe) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      // A second finger (a pinch) cancels the swipe.
      start.current =
        e.touches.length === 1 && t && !isTypingTarget(e.target)
          ? { x: t.clientX, y: t.clientY }
          : null;
    },
    onTouchEnd(e: TouchEvent) {
      const from = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!from || !t) return;
      const swipe = swipeOf(t.clientX - from.x, t.clientY - from.y);
      if (swipe) onSwipe(swipe);
    },
    onTouchCancel() {
      start.current = null;
    },
  };
}
