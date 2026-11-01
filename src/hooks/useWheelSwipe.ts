import { useEffect, useRef } from "react";
import { swipeOf, type Swipe } from "./useSwipe";

/** Quiet time, in ms, that ends a trackpad gesture, its momentum included. */
const GESTURE_GAP_MS = 200;
/** Speed-up, in px per event, that can't be momentum's rounding jitter. */
const RISE_PX = 4;
/** Events in a row that must look like a new swipe: one alone may be a coalesced pair. */
const FRESH_RUN = 2;

/** A gesture that has made its swipe, watched for the next swipe starting in its momentum. */
interface Spent {
  /** The swipe's way along deltaX: 1 or -1. */
  dir: number;
  /** Its fastest event, and its slowest since, in px along `dir`. */
  peak: number;
  floor: number;
  /** Events in a row that look like a new swipe starting. */
  run: number;
}

/** One trackpad gesture so far: sideways wheel events no more than GESTURE_GAP_MS apart. */
export interface WheelGesture {
  /** Travel towards a swipe: the gesture's, or once spent, the new swipe's run. */
  x: number;
  y: number;
  /** When its last event came, in ms. */
  last: number;
  spent: Spent | null;
}

export const newGesture = (): WheelGesture => ({ x: 0, y: 0, last: -Infinity, spent: null });

/**
 * Whether an event in a spent gesture, `v` px along its swipe, looks like a
 * new swipe. Momentum only slows, so it can't be speeding up again once it
 * has slowed to half its peak, or running back the other way. Before that,
 * the swipe may still be gathering speed.
 */
function looksFresh(s: Spent, v: number): boolean {
  if (v <= -RISE_PX) return true;
  if (s.floor <= s.peak / 2 && v > Math.max(s.floor * 2, s.floor + RISE_PX)) return true;
  if (v > s.peak) s.peak = s.floor = v;
  else if (v > 0) s.floor = Math.min(s.floor, v);
  return false;
}

/**
 * Adds one wheel event to the gesture and returns the swipe it completes, if
 * any. A gesture makes one swipe, then waits out its momentum, unless a new
 * swipe starts in it. A positive deltaX scrolls right, which is the fingers
 * moving left with macOS's natural scrolling, so it reads as a swipe left.
 */
export function trackWheel(g: WheelGesture, dx: number, dy: number, time: number): Swipe | null {
  if (time - g.last > GESTURE_GAP_MS) Object.assign(g, newGesture());
  g.last = time;
  const s = g.spent;
  if (s) {
    if (!looksFresh(s, dx * s.dir)) {
      g.x = g.y = s.run = 0;
      return null;
    }
    g.x += dx;
    g.y += dy;
    if (++s.run < FRESH_RUN) return null;
    g.spent = null;
  } else {
    g.x += dx;
    g.y += dy;
  }
  const swipe = swipeOf(-g.x, -g.y);
  if (swipe) {
    g.spent = { dir: Math.sign(g.x), peak: Math.abs(dx), floor: Math.abs(dx), run: 0 };
    g.x = g.y = 0;
  }
  return swipe;
}

/**
 * Two-finger trackpad swipes on `el`, read from its wheel events: `onSwipe`
 * fires once per sideways swipe. Sideways wheeling is kept from the browser,
 * so it can't swipe back a page; vertical wheeling still scrolls.
 */
export function useWheelSwipe(
  el: HTMLElement | null,
  onSwipe: (swipe: Swipe) => void,
  enabled = true,
) {
  const latest = useRef(onSwipe);
  latest.current = onSwipe;
  useEffect(() => {
    if (!el || !enabled) return;
    const gesture = newGesture();
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const swipe = trackWheel(gesture, e.deltaX, e.deltaY, e.timeStamp);
      if (swipe) latest.current(swipe);
    };
    // Not passive: preventDefault is what stops the browser's back swipe.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [el, enabled]);
}
