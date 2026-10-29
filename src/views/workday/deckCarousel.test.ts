import { describe, it, expect } from "vitest";
import { depthStyle, glideEase, loopWindow, outgoingOffset } from "./deckCarousel";
import type { DeckTicket } from "./deckTypes";

const t = (id: string) => ({ id }) as DeckTicket;
const ids = (n: number) => Array.from({ length: n }, (_, i) => t(`T${i + 1}`));
const shape = (slots: ReturnType<typeof loopWindow>) =>
  slots.map((s) => `${s.offset}:${s.ticket.id}:${s.key}`);

describe("loopWindow", () => {
  it("puts two stops each side of the selected one, wrapping around the ends", () => {
    const stops = ids(6);
    expect(shape(loopWindow(stops, stops[0]))).toEqual([
      "-2:T5:T5",
      "-1:T6:T6",
      "0:T1:T1",
      "1:T2:T2",
      "2:T3:T3",
    ]);
    expect(loopWindow(stops, stops[5]).map((s) => s.ticket.id)).toEqual([
      "T4",
      "T5",
      "T6",
      "T1",
      "T2",
    ]);
  });

  it("shows the selected ticket object, not its copy in the stops", () => {
    const stops = ids(3);
    const frozen = { ...stops[1], title: "frozen" };
    expect(loopWindow(stops, frozen).find((s) => s.offset === 0)!.ticket).toBe(frozen);
  });

  it("has no neighbours with one stop, or when the selection isn't a stop", () => {
    const one = ids(1);
    expect(shape(loopWindow(one, one[0]))).toEqual(["0:T1:T1"]);
    expect(shape(loopWindow(ids(4), t("X")))).toEqual(["0:X:X"]);
  });

  it("keys repeats in a short loop apart, nearest the centre first", () => {
    const stops = ids(2);
    expect(shape(loopWindow(stops, stops[0]))).toEqual([
      "-2:T1:T1~1",
      "-1:T2:T2",
      "0:T1:T1",
      "1:T2:T2~1",
      "2:T1:T1~2",
    ]);
  });

  it("swaps a leaving ticket in on its side", () => {
    const stops = ids(6);
    const gone = t("GONE");
    expect(shape(loopWindow(stops, stops[2], { ticket: gone, offset: -1 }))).toEqual([
      "-2:T1:T1",
      "-1:GONE:GONE",
      "0:T3:T3",
      "1:T4:T4",
      "2:T5:T5",
    ]);
  });
});

describe("outgoingOffset", () => {
  const stops = ids(6);

  it("finds the previous card's place in the new window", () => {
    expect(outgoingOffset(loopWindow(stops, stops[1]), "T1", "next")).toBe(-1);
    expect(outgoingOffset(loopWindow(stops, stops[0]), "T2", "prev")).toBe(1);
    // A wrap: T6 → T1 is a step forward, and T6 sits just before T1.
    expect(outgoingOffset(loopWindow(stops, stops[0]), "T6", "next")).toBe(-1);
    expect(outgoingOffset(loopWindow(stops, stops[3]), "T2", "next")).toBe(-2);
  });

  it("prefers the side the move leaves from when a short loop repeats the card", () => {
    const two = ids(2);
    expect(outgoingOffset(loopWindow(two, two[1]), "T1", "next")).toBe(-1);
    expect(outgoingOffset(loopWindow(two, two[1]), "T1", "prev")).toBe(1);
  });

  it("is null when the previous card isn't in the window", () => {
    expect(outgoingOffset(loopWindow(ids(8), ids(8)[0]), "T5", "next")).toBeNull();
  });
});

describe("depthStyle", () => {
  it("is full size at the centre and shrinks and fades one card out", () => {
    expect(depthStyle(0)).toEqual({ scale: 1, opacity: 1 });
    expect(depthStyle(1)).toEqual({ scale: 0.9, opacity: 0.45 });
    expect(depthStyle(-1)).toEqual({ scale: 0.9, opacity: 0.45 });
  });

  it("counts sub-pixel rounding as centred", () => {
    expect(depthStyle(0.004)).toEqual({ scale: 1, opacity: 1 });
  });

  it("goes no further than one card out", () => {
    expect(depthStyle(2.5)).toEqual(depthStyle(1));
  });

  it("follows a drag in between", () => {
    const half = depthStyle(0.5);
    expect(half.scale).toBeCloseTo(0.95);
    expect(half.opacity).toBeCloseTo(0.725);
  });
});

describe("glideEase", () => {
  it("runs 0 to 1, fast then settling", () => {
    expect(glideEase(0)).toBe(0);
    expect(glideEase(1)).toBe(1);
    expect(glideEase(0.25)).toBeGreaterThan(0.7);
  });
});
