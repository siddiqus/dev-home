import { useEffect, useMemo, useState, useCallback } from "react";
import type { DeckState, DeckStateUpdates } from "./buildDeck";
import { EMPTY_DECK_STATE } from "./buildDeck";

export const DECK_STATE_KEY = "dev-home-workday-v2";
export const ARRIVAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Versioned persisted deck state with extra fields for pruning and tracking. */
interface PersistedDeckState extends DeckState {
  /** Ticket id → last time it was seen present (for 30-day pruning). */
  lastPresent: Record<string, string>;
  /** Item id → ticket id mapping (for toggleCurrent). */
  itemTickets: Record<string, string>;
}

const EMPTY_PERSISTED: PersistedDeckState = {
  ...EMPTY_DECK_STATE,
  lastPresent: {},
  itemTickets: {},
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A string → `T` map, keeping only entries whose value passes `ok`; else null. */
function recordOf<T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> | null {
  if (!isRecord(v)) return null;
  const out: Record<string, T> = {};
  for (const [k, x] of Object.entries(v)) if (ok(x)) out[k] = x;
  return out;
}

const isString = (x: unknown): x is string => typeof x === "string";
const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const stringsOf = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter(isString) : null);

/**
 * The saved fields, each checked for shape: a field of the wrong type (a
 * hand-edited or corrupted entry) falls back to its default on its own.
 */
function sanitize(raw: Record<string, unknown>): PersistedDeckState {
  const d = EMPTY_PERSISTED;
  return {
    arrival: recordOf(raw.arrival, isNumber) ?? d.arrival,
    current: stringsOf(raw.current) ?? d.current,
    currentTickets: stringsOf(raw.currentTickets) ?? d.currentTickets,
    seen: recordOf(raw.seen, isString) ?? d.seen,
    closed: recordOf(raw.closed, isString) ?? d.closed,
    selected: isString(raw.selected) ? raw.selected : d.selected,
    seeded: typeof raw.seeded === "boolean" ? raw.seeded : d.seeded,
    lastPresent: recordOf(raw.lastPresent, isString) ?? d.lastPresent,
    itemTickets: recordOf(raw.itemTickets, isString) ?? d.itemTickets,
  };
}

/** Read from localStorage, tolerating missing/garbled/other-version/wrong-shape JSON. */
function read(): PersistedDeckState {
  try {
    const saved = localStorage.getItem(DECK_STATE_KEY);
    if (!saved) return EMPTY_PERSISTED;
    const parsed: unknown = JSON.parse(saved);
    // Version check: only accept v: 1
    if (!isRecord(parsed) || parsed.v !== 1) return EMPTY_PERSISTED;
    return sanitize(parsed);
  } catch {
    return EMPTY_PERSISTED;
  }
}

/** Write to localStorage, swallowing quota errors. */
function write(state: PersistedDeckState): void {
  try {
    localStorage.setItem(DECK_STATE_KEY, JSON.stringify({ v: 1, ...state }));
  } catch {
    /* quota exceeded */
  }
}

/**
 * Persisted deck state hook. Spec §6.3.
 *
 * Reads tolerate missing/garbled/other-version JSON. Writes are batched through
 * one useState, persisted in one useEffect. `applyUpdates` with an empty patch
 * does not change identity (no render loop).
 */
export function useDeckState() {
  const [internalState, setInternalState] = useState<PersistedDeckState>(read);

  // Persist on every state change
  useEffect(() => {
    write(internalState);
  }, [internalState]);

  // Public state without internal fields
  // Memoised so consumers (buildDeck's useMemo) only recompute when state changes.
  const state: DeckState = useMemo(
    () => ({
      arrival: internalState.arrival,
      current: internalState.current,
      currentTickets: internalState.currentTickets,
      seen: internalState.seen,
      closed: internalState.closed,
      selected: internalState.selected,
      seeded: internalState.seeded,
    }),
    [internalState],
  );

  const toggleCurrent = useCallback((itemId: string, ticketId: string) => {
    setInternalState((prev) => {
      const idx = prev.current.indexOf(itemId);
      if (idx === -1) {
        // Mark current: append item, record mapping, append ticket to currentTickets if first
        const newCurrent = [...prev.current, itemId];
        const newItemTickets = { ...prev.itemTickets, [itemId]: ticketId };
        // Check if any other current item belongs to this ticket
        const hasOtherCurrent = prev.current.some((id) => prev.itemTickets[id] === ticketId);
        const newCurrentTickets = hasOtherCurrent
          ? prev.currentTickets
          : [...prev.currentTickets, ticketId];
        return {
          ...prev,
          current: newCurrent,
          itemTickets: newItemTickets,
          currentTickets: newCurrentTickets,
        };
      } else {
        // Unmark: remove item, remove ticket from currentTickets if last
        const newCurrent = prev.current.filter((id) => id !== itemId);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [itemId]: _removed, ...newItemTickets } = prev.itemTickets;
        // Check if any remaining current item belongs to this ticket
        const hasOtherCurrent = newCurrent.some((id) => prev.itemTickets[id] === ticketId);
        const newCurrentTickets = hasOtherCurrent
          ? prev.currentTickets
          : prev.currentTickets.filter((id) => id !== ticketId);
        return {
          ...prev,
          current: newCurrent,
          itemTickets: newItemTickets,
          currentTickets: newCurrentTickets,
        };
      }
    });
  }, []);

  const markSeen = useCallback((entries: Record<string, string>) => {
    setInternalState((prev) => {
      const newSeen = { ...prev.seen };
      let changed = false;
      for (const [id, iso] of Object.entries(entries)) {
        const existing = newSeen[id];
        // Monotonic: never move backwards
        if (!existing || iso > existing) {
          newSeen[id] = iso;
          changed = true;
        }
      }
      return changed ? { ...prev, seen: newSeen } : prev;
    });
  }, []);

  const markUnread = useCallback((prUrl: string) => {
    setInternalState((prev) => {
      if (!(prUrl in prev.seen)) return prev;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [prUrl]: _removed, ...newSeen } = prev.seen;
      return { ...prev, seen: newSeen };
    });
  }, []);

  const close = useCallback((ticketId: string, at?: Date) => {
    setInternalState((prev) => ({
      ...prev,
      closed: { ...prev.closed, [ticketId]: (at ?? new Date()).toISOString() },
    }));
  }, []);

  const reopen = useCallback((ticketId: string) => {
    setInternalState((prev) => {
      if (!(ticketId in prev.closed)) return prev;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [ticketId]: _removed, ...newClosed } = prev.closed;
      return { ...prev, closed: newClosed };
    });
  }, []);

  const select = useCallback((ticketId: string | null) => {
    setInternalState((prev) => ({ ...prev, selected: ticketId }));
  }, []);

  /**
   * Applies buildDeck's patch. `presentIds` are the deck's ticket ids;
   * `presentSeen`, when given, the `seen` ids still on the deck (PR urls and
   * `ticket:<KEY>`), so stale `seen` entries can be pruned.
   */
  const applyUpdates = useCallback(
    (u: DeckStateUpdates, presentIds: string[], now: Date, presentSeen?: string[]) => {
      setInternalState((prev) => {
        let next = prev;
        let changed = false;

        // Move migrated ticket pins onto their PR, in place (or drop them).
        if (u.migrateCurrent && u.migrateCurrent.length > 0) {
          const newItemTickets = { ...next.itemTickets };
          const swap = new Map(u.migrateCurrent.map((m) => [m.from, m]));
          const newCurrent = next.current.flatMap((id) => {
            const m = swap.get(id);
            if (!m) return [id];
            delete newItemTickets[id];
            if (!m.to || next.current.includes(m.to)) return [];
            newItemTickets[m.to] = m.ticketId;
            return [m.to];
          });
          next = { ...next, current: newCurrent, itemTickets: newItemTickets };
          changed = true;
        }

        // Merge new arrivals
        if (u.arrival && Object.keys(u.arrival).length > 0) {
          next = { ...next, arrival: { ...next.arrival, ...u.arrival } };
          changed = true;
        }

        // Reopen closed tickets
        if (u.reopen && u.reopen.length > 0) {
          const newClosed = { ...next.closed };
          for (const id of u.reopen) delete newClosed[id];
          next = { ...next, closed: newClosed };
          changed = true;
        }

        // Prune dropCurrent entries from current, itemTickets, and dropCurrentTickets from currentTickets
        if (u.dropCurrent && u.dropCurrent.length > 0) {
          const dropSet = new Set(u.dropCurrent);
          const newCurrent = next.current.filter((id) => !dropSet.has(id));
          const newItemTickets = { ...next.itemTickets };
          for (const id of u.dropCurrent) delete newItemTickets[id];
          if (newCurrent.length !== next.current.length) {
            next = { ...next, current: newCurrent, itemTickets: newItemTickets };
            changed = true;
          }
        }
        if (u.dropCurrentTickets && u.dropCurrentTickets.length > 0) {
          const dropSet = new Set(u.dropCurrentTickets);
          const newCurrentTickets = next.currentTickets.filter((id) => !dropSet.has(id));
          if (newCurrentTickets.length !== next.currentTickets.length) {
            next = { ...next, currentTickets: newCurrentTickets };
            changed = true;
          }
        }

        // Seed seen map on first run
        if (u.seen) {
          next = { ...next, seen: { ...next.seen, ...u.seen } };
          changed = true;
        }
        if (u.seeded) {
          next = { ...next, seeded: true };
          changed = true;
        }

        // Update lastPresent for all present ids
        const nowIso = now.toISOString();
        const newLastPresent = { ...next.lastPresent };
        let lastPresentChanged = false;
        for (const id of presentIds) {
          if (newLastPresent[id] !== nowIso) {
            newLastPresent[id] = nowIso;
            lastPresentChanged = true;
          }
        }
        if (lastPresentChanged) {
          next = { ...next, lastPresent: newLastPresent };
          changed = true;
        }

        // Prune arrival entries absent for > 30 days
        const cutoff = now.getTime() - ARRIVAL_TTL_MS;
        const presentSet = new Set(presentIds);
        const newArrival = { ...next.arrival };
        let arrivalChanged = false;
        for (const id in newArrival) {
          if (!presentSet.has(id)) {
            const lastSeen = newLastPresent[id];
            if (lastSeen && new Date(lastSeen).getTime() < cutoff) {
              delete newArrival[id];
              delete newLastPresent[id];
              arrivalChanged = true;
            }
          }
        }
        if (arrivalChanged) {
          next = { ...next, arrival: newArrival, lastPresent: newLastPresent };
          changed = true;
        }

        // Prune `seen` entries older than the TTL for PRs and tickets no longer on the deck.
        if (presentSeen) {
          const seenSet = new Set(presentSeen);
          const newSeen = { ...next.seen };
          let seenChanged = false;
          for (const id in newSeen) {
            if (!seenSet.has(id) && new Date(newSeen[id]).getTime() < cutoff) {
              delete newSeen[id];
              seenChanged = true;
            }
          }
          if (seenChanged) {
            next = { ...next, seen: newSeen };
            changed = true;
          }
        }

        // Prune `closed` entries older than the TTL for tickets no longer on the deck.
        const newClosed = { ...next.closed };
        let closedChanged = false;
        for (const id in newClosed) {
          if (!presentSet.has(id) && new Date(newClosed[id]).getTime() < cutoff) {
            delete newClosed[id];
            closedChanged = true;
          }
        }
        if (closedChanged) {
          next = { ...next, closed: newClosed };
          changed = true;
        }

        return changed ? next : prev;
      });
    },
    [],
  );

  return {
    state,
    toggleCurrent,
    markSeen,
    markUnread,
    close,
    reopen,
    select,
    applyUpdates,
  };
}
