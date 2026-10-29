import { renderHook, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDeckCarousel } from "./useDeckCarousel";

// jsdom has no layout: a 400px track of five 300px slides after a 50px lead-in.
// The current card (offset 0) is centred at scrollLeft 600; cards are 300 apart.
const CENTRE = 600;
const PITCH = 300;

function makeTrack() {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: 400 });
  let left = 0;
  Object.defineProperty(el, "scrollLeft", {
    get: () => left,
    set: (v: number) => {
      left = v;
    },
  });
  [-2, -1, 0, 1, 2].forEach((offset, i) => {
    const slide = document.createElement("div");
    slide.className = "deck-slide";
    slide.dataset.offset = String(offset);
    Object.defineProperty(slide, "offsetLeft", { value: 50 + PITCH * i });
    Object.defineProperty(slide, "offsetWidth", { value: 300 });
    slide.appendChild(document.createElement("div"));
    el.appendChild(slide);
  });
  document.body.appendChild(el);
  return el;
}

const card = (el: HTMLElement, offset: number) =>
  el.querySelector<HTMLElement>(`[data-offset="${offset}"]`)!.firstElementChild as HTMLElement;

function setup() {
  const el = makeTrack();
  const onSettle = vi.fn();
  const onGlideEnd = vi.fn();
  const hook = renderHook(
    ({ id, from }: { id: string; from: number | null }) =>
      useDeckCarousel(el, { selectedId: id, from, onSettle, onGlideEnd }),
    { initialProps: { id: "A", from: null as number | null } },
  );
  /** A swipe to `left` that the browser has finished scrolling. */
  const swipeTo = (left: number) => {
    el.scrollLeft = left;
    fireEvent.scroll(el);
    el.dispatchEvent(new Event("scrollend"));
  };
  return { el, onSettle, onGlideEnd, swipeTo, ...hook };
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
    ],
  });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useDeckCarousel", () => {
  it("centres the current card and shrinks and fades its neighbours", () => {
    const { el } = setup();
    expect(el.scrollLeft).toBe(CENTRE);
    expect(card(el, 0).style.transform).toBe("");
    expect(card(el, 1).style.transform).toBe("scale(0.9)");
    expect(card(el, -1).style.opacity).toBe("0.45");
  });

  it("sizes the cards with the drag", () => {
    const { el } = setup();
    el.scrollLeft = CENTRE + PITCH / 2;
    fireEvent.scroll(el);
    expect(card(el, 0).style.transform).toBe(card(el, 1).style.transform);
    expect(card(el, 1).style.transform).toMatch(/^scale\(0\.95/);
  });

  it("reports a swipe that settles on a neighbour, and lands the new card without moving", () => {
    const { el, onSettle, onGlideEnd, swipeTo, rerender } = setup();
    swipeTo(CENTRE + PITCH);
    expect(onSettle).toHaveBeenCalledWith(1);
    // The selection follows; the previous card is now the left neighbour.
    rerender({ id: "B", from: -1 });
    expect(el.scrollLeft).toBe(CENTRE);
    expect(onGlideEnd).toHaveBeenCalledTimes(1);
    expect(card(el, 0).style.transform).toBe("");
  });

  it("reports nothing for a swipe that springs back to the current card", () => {
    const { onSettle, swipeTo } = setup();
    swipeTo(CENTRE);
    vi.advanceTimersByTime(1000);
    expect(onSettle).not.toHaveBeenCalled();
  });

  it("waits for the finger to lift before settling", () => {
    const { el, onSettle, swipeTo } = setup();
    fireEvent.touchStart(el);
    swipeTo(CENTRE - PITCH);
    vi.advanceTimersByTime(1000);
    expect(onSettle).not.toHaveBeenCalled();
    fireEvent.touchEnd(el);
    vi.advanceTimersByTime(200);
    expect(onSettle).toHaveBeenCalledWith(-1);
  });

  it("springs back to the current card when the selection doesn't follow a settle", () => {
    const { el, onSettle, swipeTo } = setup();
    swipeTo(CENTRE + PITCH);
    expect(onSettle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(400 + 800);
    expect(el.scrollLeft).toBe(CENTRE);
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it("glides a key move in from where the previous card sits", () => {
    const { el, onGlideEnd, rerender } = setup();
    rerender({ id: "B", from: -1 });
    expect(el.scrollLeft).toBe(CENTRE - PITCH);
    vi.advanceTimersByTime(200);
    expect(el.scrollLeft).toBeGreaterThan(CENTRE - PITCH);
    expect(el.scrollLeft).toBeLessThan(CENTRE);
    expect(onGlideEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(el.scrollLeft).toBe(CENTRE);
    expect(onGlideEnd).toHaveBeenCalledTimes(1);
  });

  it("picks up from mid-glide when keys are pressed in a row", () => {
    const { el, rerender } = setup();
    rerender({ id: "B", from: -1 });
    vi.advanceTimersByTime(200);
    const mid = el.scrollLeft;
    rerender({ id: "C", from: -1 });
    // The view hasn't jumped: still showing what it showed, one card further along.
    expect(el.scrollLeft).toBeCloseTo(mid - PITCH);
    vi.advanceTimersByTime(800);
    expect(el.scrollLeft).toBe(CENTRE);
  });

  it("re-centres without gliding on a move with no direction", () => {
    const { el, onGlideEnd, rerender } = setup();
    rerender({ id: "B", from: null });
    expect(el.scrollLeft).toBe(CENTRE);
    expect(onGlideEnd).toHaveBeenCalledTimes(1);
  });

  it("lands a glide at once when a finger touches down mid-glide", () => {
    const { el, onGlideEnd, rerender } = setup();
    rerender({ id: "B", from: 1 });
    vi.advanceTimersByTime(100);
    fireEvent.touchStart(el);
    expect(el.scrollLeft).toBe(CENTRE);
    expect(onGlideEnd).toHaveBeenCalledTimes(1);
  });
});
