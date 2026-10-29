import type { DeckTicket } from "./deckTypes";

/** Which way the selection moved: "next" brings the new card in from the right. */
export type SwipeDirection = "next" | "prev";

/** Cards each side of the current one: two, so a peek never shows a gap while a swipe settles. */
export const LOOP_RADIUS = 2;

/** One card on the carousel track. */
export interface LoopSlot {
  ticket: DeckTicket;
  /** Place relative to the current card: 0 is the current one, -1 the previous, 1 the next. */
  offset: number;
  /**
   * React key: the ticket's id, so a card keeps its element (and its scroll)
   * as it moves along the track. A short loop shows a ticket more than once;
   * the copies further from the centre get a suffix.
   */
  key: string;
}

/**
 * The carousel's cards: the selected ticket and LOOP_RADIUS stops each side,
 * wrapping around `stops` (the Prev / Next order). One stop, or a selection
 * that isn't a stop, has no neighbours. `outgoing` puts a card that left the
 * loop (a jump's or a close's previous card) on the side it leaves by.
 */
export function loopWindow(
  stops: DeckTicket[],
  selected: DeckTicket,
  outgoing?: { ticket: DeckTicket; offset: number } | null,
): LoopSlot[] {
  const at = stops.findIndex((s) => s.id === selected.id);
  if (at === -1 || stops.length < 2) return [{ ticket: selected, offset: 0, key: selected.id }];
  const n = stops.length;
  const pick = (offset: number) =>
    offset === 0
      ? selected
      : outgoing?.offset === offset
        ? outgoing.ticket
        : stops[(((at + offset) % n) + n) % n];
  // Keys go out from the centre, so the nearest copy of a ticket keeps the plain id.
  const order = [0];
  for (let d = 1; d <= LOOP_RADIUS; d++) order.push(-d, d);
  const seen = new Map<string, number>();
  const slots = order.map((offset) => {
    const ticket = pick(offset);
    const copies = seen.get(ticket.id) ?? 0;
    seen.set(ticket.id, copies + 1);
    return { ticket, offset, key: copies === 0 ? ticket.id : `${ticket.id}~${copies}` };
  });
  return slots.sort((a, b) => a.offset - b.offset);
}

/**
 * Where the previously selected card sits on the new card's track, so the
 * move can start from it: on the side the move leaves by when a short loop
 * shows it twice. Null when it isn't on the track.
 */
export function outgoingOffset(
  slots: LoopSlot[],
  previousId: string,
  dir: SwipeDirection,
): number | null {
  const back = dir === "next" ? -1 : 1;
  const places = slots
    .filter((s) => s.offset !== 0 && s.ticket.id === previousId)
    .map((s) => s.offset);
  const behind = places.filter((o) => Math.sign(o) === back);
  const pool = behind.length > 0 ? behind : places;
  return pool.sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? null;
}

/** A neighbour's size and fade, one card out from the centre. */
const NEIGHBOUR = { scale: 0.9, opacity: 0.45 };

/**
 * A card's size and fade at `distance` cards from the centre: full size in
 * the middle, shrinking and fading as it moves out, no further than one card.
 * Within a hundredth of a card (sub-pixel scroll rounding) counts as centred,
 * so the current card isn't left a hair scaled, and blurred.
 */
export function depthStyle(distance: number): { scale: number; opacity: number } {
  const d = Math.abs(distance) < 0.01 ? 0 : Math.min(Math.abs(distance), 1);
  return {
    scale: 1 * (1 - d) + NEIGHBOUR.scale * d,
    opacity: 1 * (1 - d) + NEIGHBOUR.opacity * d,
  };
}

/** The glide's ease, over 0..1: fast off the mark, then settling (≈ the deck's old swipe curve). */
export function glideEase(t: number): number {
  return 1 - (1 - t) ** 5;
}
