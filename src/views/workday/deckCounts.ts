import type { DeckTicket } from "./deckTypes";

export interface DeckCounts {
  /** Distinct open PRs of mine on the tabs. Merged ones don't count. */
  openPRs: number;
  /** Distinct open PRs someone requested my review on (re-reviews don't count). */
  reviewRequests: number;
}

/** What the phone's deck bar counts, over the tabs the Items drawer lists. */
export function deckCounts(rail: DeckTicket[]): DeckCounts {
  const mine = new Set<string>();
  const requested = new Set<string>();
  for (const t of rail) {
    for (const p of t.prs) {
      if (p.pr.state !== "open" || p.pr.merged_at) continue;
      if (p.mine) mine.add(p.pr.html_url);
      else if (p.requested) requested.add(p.pr.html_url);
    }
  }
  return { openPRs: mine.size, reviewRequests: requested.size };
}
