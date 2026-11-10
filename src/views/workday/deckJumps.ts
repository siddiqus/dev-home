import type { DeckTicket } from "./deckTypes";
import { isMergedTab } from "./pins";

/** The kinds of card the phone's deck bar jumps between. */
export type DeckKind = "authored" | "review";

/** One jump chip: how many cards of a kind there are, and where the first one is. */
export interface DeckJump {
  kind: DeckKind;
  label: string;
  count: number;
  firstId: string;
}

const ORDER: DeckKind[] = ["authored", "review"];

const LABELS: Record<DeckKind, string> = {
  authored: "Authored",
  review: "To Review",
};

/**
 * A tab's kind: review-only (every PR on it is someone else's), else mine,
 * PR-less tickets included. Merged recently tabs have none: swiping skips them,
 * so a chip would jump off the deck. Nor do note tabs (a lone #todo).
 */
export function deckKind(t: DeckTicket): DeckKind | null {
  if (isMergedTab(t.id) || t.noteItem) return null;
  return t.reviewOnly ? "review" : "authored";
}

/**
 * The phone deck bar's jump chips over the tabs the Items drawer lists: one per
 * kind with any tabs, in a fixed order, each pointing at its first tab in rail order.
 */
export function deckJumps(rail: DeckTicket[]): DeckJump[] {
  const byKind = new Map<DeckKind, DeckJump>();
  for (const t of rail) {
    const kind = deckKind(t);
    if (!kind) continue;
    const jump = byKind.get(kind);
    if (jump) jump.count++;
    else byKind.set(kind, { kind, label: LABELS[kind], count: 1, firstId: t.id });
  }
  return ORDER.flatMap((k) => byKind.get(k) ?? []);
}
