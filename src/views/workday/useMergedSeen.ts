import { useMemo, useState } from "react";
import { usePersistedState } from "../../hooks/usePersistedState";
import type { DeckTicket } from "./deckTypes";

/** How far the phone's Items drawer has shown Merged recently: the newest merge on show (ms). */
export const MERGED_SEEN_KEY = "dev-home-workday-v2-merged-seen";

/** A Merged recently tab's newest merge (its PRs are newest first), in ms. */
const lastMerge = (t: DeckTicket) => Date.parse(t.prs[0]?.pr.merged_at ?? "") || 0;

/**
 * Whether Merged recently has a merge the phone's Items drawer hasn't shown
 * (`hasNew`, the Items button's dot), and while the drawer is open, which tabs
 * were new when it opened (`newIds`, their rows' dots). Opening the drawer, or
 * a merge landing while it's open, marks everything on show as seen: seen goes
 * by the newest merge shown, not the clock, so a merge that loads later still
 * counts. The first time, it starts from `now`, so a day of old merges isn't new.
 * Kept on this device.
 */
export function useMergedSeen(merged: DeckTicket[], open: boolean, now: Date) {
  const [seenAt, setSeenAt] = usePersistedState(MERGED_SEEN_KEY, now.getTime());
  // What was seen before this opening, so the rows keep their dots while it's open.
  const [heldAt, setHeldAt] = useState<number | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const newest = merged.reduce((m, t) => Math.max(m, lastMerge(t)), 0);
  // Adjusted during render, so the dot is gone by the time the drawer shows.
  if (open !== wasOpen) {
    setWasOpen(open);
    setHeldAt(open ? seenAt : null);
  }
  if (open && newest > seenAt) setSeenAt(newest);
  const newIds = useMemo(
    () =>
      heldAt === null
        ? null
        : new Set(merged.filter((t) => lastMerge(t) > heldAt).map((t) => t.id)),
    [merged, heldAt],
  );
  return { hasNew: newest > seenAt, newIds };
}
