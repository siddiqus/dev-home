import { describe, it, expect } from "vitest";
import type { GitHubPR } from "../../types";
import type { DeckPR, DeckTicket } from "./deckTypes";
import { deckCounts } from "./deckCounts";

const pr = (
  url: string,
  over: Partial<GitHubPR> = {},
  who: { mine?: boolean; requested?: boolean } = { mine: true },
): DeckPR =>
  ({
    pr: { html_url: url, state: "open", merged_at: null, ...over },
    mine: !!who.mine,
    requested: who.requested,
  }) as DeckPR;

const ticket = (key: string | null, prs: DeckPR[] = []): DeckTicket =>
  ({ id: key ?? "pr-only", key, prs }) as DeckTicket;

describe("deckCounts", () => {
  it("counts my distinct open PRs, on any tab", () => {
    const shared = "https://github.com/acme/web/pull/1";
    const counts = deckCounts([
      ticket("WMU-1", [pr(shared), pr("https://github.com/acme/web/pull/2")]),
      // The same PR on a second ticket counts once.
      ticket("WMU-2", [pr(shared)]),
      // A PR with no ticket counts too.
      ticket(null, [pr("https://github.com/acme/api/pull/9")]),
    ]);
    expect(counts).toEqual({ openPRs: 3, reviewRequests: 0 });
  });

  it("leaves merged PRs out", () => {
    const counts = deckCounts([
      ticket("WMU-1", [
        pr("https://github.com/acme/web/pull/3", { state: "closed", merged_at: "2026-10-30" }),
      ]),
    ]);
    expect(counts).toEqual({ openPRs: 0, reviewRequests: 0 });
  });

  it("counts review requests apart, and leaves re-reviews out", () => {
    const counts = deckCounts([
      ticket("WMU-1", [
        pr("https://github.com/acme/web/pull/4"),
        pr("https://github.com/acme/web/pull/5", {}, { requested: true }),
        // New commits on a PR I reviewed: on the deck, but nobody asked.
        pr("https://github.com/acme/web/pull/6", {}, {}),
      ]),
    ]);
    expect(counts).toEqual({ openPRs: 1, reviewRequests: 1 });
  });
});
