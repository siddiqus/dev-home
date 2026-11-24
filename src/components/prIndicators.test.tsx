import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PRIcon, prIconState, type PRIconInput } from "./prIndicators";

const pr = (o: Partial<PRIconInput> = {}): PRIconInput => ({
  state: "open",
  draft: false,
  merged_at: undefined,
  in_merge_queue: false,
  ...o,
});

describe("prIconState", () => {
  it("is merged once the PR has merged", () => {
    expect(prIconState(pr({ state: "closed", merged_at: "2026-10-01T00:00:00Z" }))).toBe("merged");
  });

  it("is merged while the PR sits in the merge queue", () => {
    expect(prIconState(pr({ in_merge_queue: true }))).toBe("merged");
  });

  it("is closed for a PR closed without merging", () => {
    expect(prIconState(pr({ state: "closed" }))).toBe("closed");
  });

  it("is draft for an open draft", () => {
    expect(prIconState(pr({ draft: true }))).toBe("draft");
  });

  it("prefers merged over draft", () => {
    expect(prIconState(pr({ draft: true, in_merge_queue: true }))).toBe("merged");
  });

  it("is open otherwise", () => {
    expect(prIconState(pr())).toBe("open");
  });
});

describe("PRIcon", () => {
  const stateClass = (p: Partial<PRIconInput>) => {
    const { container } = render(<PRIcon pr={pr(p)} />);
    return container.querySelector("svg")?.getAttribute("class") ?? "";
  };

  it("marks the glyph with the PR's state", () => {
    expect(stateClass({ in_merge_queue: true })).toContain("pr-icon--merged");
    expect(stateClass({ state: "closed" })).toContain("pr-icon--closed");
    expect(stateClass({})).toContain("pr-icon--open");
  });

  it("uses a different glyph for merged than for open", () => {
    const glyph = (p: Partial<PRIconInput>) => {
      const { container } = render(<PRIcon pr={pr(p)} />);
      return container.querySelector("svg")?.innerHTML;
    };
    expect(glyph({ merged_at: "2026-10-01T00:00:00Z", state: "closed" })).not.toBe(glyph({}));
  });
});
