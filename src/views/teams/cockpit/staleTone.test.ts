import { describe, it, expect } from "vitest";
import { STALLED_CHIP_STYLE, staleTone } from "./staleTone";

describe("staleTone", () => {
  it("returns amber for days <= 4", () => {
    expect(staleTone(3)).toBe("#e0a458");
    expect(staleTone(4)).toBe("#e0a458");
  });

  it("returns red for days > 4", () => {
    expect(staleTone(5)).toBe("#dc3545");
    expect(staleTone(9)).toBe("#dc3545");
  });
});

describe("STALLED_CHIP_STYLE", () => {
  it("is one light red for every stalled count", () => {
    expect(STALLED_CHIP_STYLE).toEqual({
      background: "rgba(220,53,69,.08)",
      color: "#dc3545",
      border: "1px solid rgba(220,53,69,.25)",
    });
  });
});
