import type { GitHubPR } from "../../types";
import type { DeckPR } from "../workday/deckTypes";
import { mergedSignal, mySignals, prPriority } from "../workday/signals";

/**
 * A PR search result as a Workday PR card. Open PRs show their next step from
 * the author's side, since a searcher wants to know where a PR stands; merged
 * ones say when they merged. None of Workday's per-me context (unseen, notes,
 * quotes, current) applies.
 */
export function searchPR(pr: GitHubPR, now: Date): DeckPR {
  const merged = !!pr.merged_at || pr.state === "merged";
  const signals = merged ? [mergedSignal(pr, now)] : mySignals(pr, now);
  return {
    pr,
    mine: false,
    signals,
    priority: prPriority(signals),
    unseenComment: null,
    note: null,
    current: false,
    unseen: false,
  };
}
