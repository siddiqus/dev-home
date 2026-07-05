import { describe, it, expect } from "vitest";
import { staleTone } from "./staleTone";

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
