import { describe, it, expect } from "vitest";
import { deriveReviewStatus } from "./mapping";

const r = (login: string, state: string) => ({ state, author: { login } });

describe("deriveReviewStatus", () => {
  it("keeps an approval when the reviewer later leaves a comment-only review", () => {
    expect(deriveReviewStatus([r("bob", "APPROVED"), r("bob", "COMMENTED")])).toBe("APPROVED");
  });

  it("ignores the author's own replies and bots", () => {
    const reviews = [r("me", "COMMENTED"), r("copilot-pull-request-reviewer[bot]", "COMMENTED")];
    expect(deriveReviewStatus(reviews, { author: "me" })).toBeNull();
  });

  it("lets a later approval replace changes requested", () => {
    expect(deriveReviewStatus([r("bob", "CHANGES_REQUESTED"), r("bob", "APPROVED")])).toBe(
      "APPROVED",
    );
  });

  it("treats a dismissed review as a comment", () => {
    expect(deriveReviewStatus([r("bob", "APPROVED"), r("bob", "DISMISSED")])).toBe("REVIEWED");
  });

  it("prefers GitHub's reviewDecision, even without fetched reviews", () => {
    expect(deriveReviewStatus(undefined, { reviewDecision: "APPROVED" })).toBe("APPROVED");
    expect(
      deriveReviewStatus([r("bob", "APPROVED")], { reviewDecision: "CHANGES_REQUESTED" }),
    ).toBe("CHANGES_REQUESTED");
  });

  it("doesn't report approved while GitHub still requires reviews", () => {
    expect(
      deriveReviewStatus([r("bob", "APPROVED")], { reviewDecision: "REVIEW_REQUIRED" }),
    ).toBeNull();
  });
});
