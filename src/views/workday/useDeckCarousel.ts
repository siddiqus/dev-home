import { useEffect, useLayoutEffect, useRef } from "react";
import { depthStyle, glideEase } from "./deckCarousel";

/** One glide between cards: the deck's old swipe length, tuned by eye. */
const GLIDE_MS = 700;
/** Quiet time after the last scroll before a swipe counts as settled, where `scrollend` is missing. */
const SETTLE_MS = 120;
/** How long a settle waits for the selection to follow before the track springs back. */
const SETTLE_TIMEOUT_MS = 400;

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** The track's motion state, shared by the render-time placement and the event listeners. */
interface Motion {
  /** scrollLeft that centres the current card, and the distance between cards. */
  center: number;
  pitch: number;
  /** Where the view is, in cards from the current one. */
  at: number;
  /** The running glide's animation frame, or 0. */
  glide: number;
  touching: boolean;
  /** The settle check waiting for scrolling to go quiet. */
  quiet: ReturnType<typeof setTimeout> | null;
  /** A settle waiting for the selection to follow. */
  pending: ReturnType<typeof setTimeout> | null;
}

const busy = (m: Motion) => m.glide !== 0 || m.touching || m.quiet !== null || m.pending !== null;

const slide = (el: HTMLElement, offset: number) =>
  el.querySelector<HTMLElement>(`:scope > .deck-slide[data-offset="${offset}"]`);

function measure(el: HTMLElement, m: Motion) {
  const cur = slide(el, 0);
  const next = slide(el, 1) ?? slide(el, -1);
  m.center = cur ? cur.offsetLeft - (el.clientWidth - cur.offsetWidth) / 2 : 0;
  m.pitch = cur && next ? Math.abs(next.offsetLeft - cur.offsetLeft) : 0;
}

/** Sizes and fades each card by its distance from the centre of the view. */
function paint(el: HTMLElement, m: Motion) {
  m.at = m.pitch ? (el.scrollLeft - m.center) / m.pitch : 0;
  for (const s of el.querySelectorAll<HTMLElement>(":scope > .deck-slide")) {
    const card = s.firstElementChild as HTMLElement | null;
    if (!card) continue;
    const { scale, opacity } = depthStyle(Number(s.dataset.offset) - m.at);
    card.style.transform = scale === 1 ? "" : `scale(${scale})`;
    card.style.opacity = opacity === 1 ? "" : String(opacity);
  }
}

/** Moves the view with snapping off, so the browser can't pull it to a snap point first. */
function moveTo(el: HTMLElement, m: Motion, left: number) {
  el.style.scrollSnapType = "none";
  el.scrollLeft = left;
  paint(el, m);
}

/** Puts the current card in the middle, snapping back on. */
function centre(el: HTMLElement, m: Motion) {
  moveTo(el, m, m.center);
  el.style.scrollSnapType = "";
}

function stopGlide(m: Motion) {
  if (m.glide) cancelAnimationFrame(m.glide);
  m.glide = 0;
}

function glideHome(el: HTMLElement, m: Motion, done?: () => void) {
  stopGlide(m);
  const start = el.scrollLeft;
  const t0 = performance.now();
  const frame = (now: number) => {
    const p = Math.min(1, (now - t0) / GLIDE_MS);
    moveTo(el, m, start + (m.center - start) * glideEase(p));
    if (p < 1) {
      m.glide = requestAnimationFrame(frame);
      return;
    }
    m.glide = 0;
    el.style.scrollSnapType = "";
    done?.();
  };
  el.style.scrollSnapType = "none";
  m.glide = requestAnimationFrame(frame);
}

export interface DeckCarouselOptions {
  /** The current card's ticket id; a change re-centres the track on it. */
  selectedId: string | null;
  /**
   * Where the previous card sits on the new card's track (see outgoingOffset):
   * the move glides in from there. Null re-centres without motion.
   */
  from: number | null;
  /** A swipe came to rest on the neighbour at `offset`. */
  onSettle(offset: number): void;
  /** The move into a new card finished, gliding or not. */
  onGlideEnd?(): void;
}

/**
 * The deck carousel's motion on `el`, a horizontal scroll-snap track of
 * `.deck-slide[data-offset]` cards. A swipe is the browser's own scrolling;
 * once it settles on a neighbour, `onSettle` moves the selection, and the
 * track re-centres on the new card without anything on screen moving. Any
 * other selection change glides in from where the previous card sits, and
 * picks up from mid-glide when keys are pressed in a row. Every frame, the
 * cards shrink and fade by their distance from the centre.
 */
export function useDeckCarousel(el: HTMLElement | null, opts: DeckCarouselOptions) {
  const { selectedId, from } = opts;
  const latest = useRef(opts);
  latest.current = opts;
  const motion = useRef<Motion>({
    center: 0,
    pitch: 0,
    at: 0,
    glide: 0,
    touching: false,
    quiet: null,
    pending: null,
  });
  const shown = useRef(selectedId);

  // After every render: a new card glides in (or lands, after a swipe); the
  // same card stays centred through refreshes, unless a swipe owns the view.
  useLayoutEffect(() => {
    if (!el) return;
    const m = motion.current;
    if (shown.current === selectedId) {
      if (busy(m)) return;
      measure(el, m);
      if (Math.abs(el.scrollLeft - m.center) > 1) centre(el, m);
      else paint(el, m);
      return;
    }
    shown.current = selectedId;
    // Where the view was, in cards from the previous card, before it re-centres.
    const was = m.at;
    stopGlide(m);
    if (m.pending) clearTimeout(m.pending);
    m.pending = null;
    measure(el, m);
    const start = from === null ? 0 : was + from;
    const done = () => latest.current.onGlideEnd?.();
    if (Math.abs(start) > 0.02 && m.pitch && !reducedMotion()) {
      moveTo(el, m, m.center + start * m.pitch);
      glideHome(el, m, done);
    } else {
      centre(el, m);
      done();
    }
  });

  useEffect(() => {
    if (!el) return;
    const m = motion.current;
    const settle = () => {
      m.quiet = null;
      if (m.touching || m.glide || m.pending) return;
      const offset = Math.round(m.at);
      if (offset === 0 || !slide(el, offset)) return;
      // The selection should follow; if it doesn't (a modal is open), spring back.
      m.pending = setTimeout(() => {
        m.pending = null;
        glideHome(el, m);
      }, SETTLE_TIMEOUT_MS);
      latest.current.onSettle(offset);
    };
    const waitForQuiet = () => {
      if (m.quiet) clearTimeout(m.quiet);
      m.quiet = setTimeout(settle, SETTLE_MS);
    };
    // A touch or a sideways wheel mid-glide lands the glide, so the user acts on the new card.
    const land = () => {
      if (!m.glide) return;
      stopGlide(m);
      centre(el, m);
      latest.current.onGlideEnd?.();
    };
    const onScroll = () => {
      // A glide paints its own frames and settles nowhere.
      if (m.glide) return;
      paint(el, m);
      waitForQuiet();
    };
    const onScrollEnd = () => {
      if (m.glide) return;
      if (m.quiet) clearTimeout(m.quiet);
      settle();
    };
    const onTouchStart = () => {
      m.touching = true;
      land();
    };
    const onTouchEnd = () => {
      m.touching = false;
      waitForQuiet();
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) land();
    };
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (busy(m)) return;
            measure(el, m);
            centre(el, m);
          });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onScrollEnd);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: true });
    resize?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScrollEnd);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      resize?.disconnect();
      stopGlide(m);
      if (m.quiet) clearTimeout(m.quiet);
      if (m.pending) clearTimeout(m.pending);
      m.quiet = m.pending = null;
      m.touching = false;
    };
  }, [el]);
}
