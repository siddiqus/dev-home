import { describe, it, expect } from "vitest";
import { STALLED_CHIP_STYLE, staleTone } from "./staleTone";

describe("staleTone", () => {
  it("returns the theme's warning color for days <= 4", () => {
    expect(staleTone(3)).toBe("var(--color-status-warning)");
    expect(staleTone(4)).toBe("var(--color-status-warning)");
  });

  it("returns the theme's danger color for days > 4", () => {
    expect(staleTone(5)).toBe("var(--color-status-danger)");
    expect(staleTone(9)).toBe("var(--color-status-danger)");
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
