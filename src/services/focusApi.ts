import { readJson, writeJson } from "../lib/localStore";

export interface FocusStateItem {
  itemId: string;
  pinnedAt: number | null;
  snoozedUntil: number | null;
  dismissedAt: number | null;
}

interface FocusRow {
  pinnedAt: number | null;
  snoozedUntil: number | null;
  dismissedAt: number | null;
  updatedAt: number;
}

export const FOCUS_KEY = "focus_state";
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function load(): Record<string, FocusRow> {
  return readJson<Record<string, FocusRow>>(FOCUS_KEY, {});
}

function requireItemId(itemId: unknown): string {
  if (typeof itemId !== "string" || !itemId) throw new Error("itemId (string) required");
  return itemId;
}

function upsert(itemId: string, patch: Partial<FocusRow>): void {
  const rows = load();
  const prev = rows[itemId] ?? { pinnedAt: null, snoozedUntil: null, dismissedAt: null };
  rows[itemId] = { ...prev, ...patch, updatedAt: Date.now() };
  writeJson(FOCUS_KEY, rows);
}

/**
 * Returns all pin/snooze/dismiss rows, first dropping rows older than 90 days
 * with no active pin, no future snooze and no dismiss.
 */
export async function fetchFocusState(): Promise<FocusStateItem[]> {
  const now = Date.now();
  const cutoff = now - NINETY_DAYS_MS;
  const rows = load();
  for (const [id, r] of Object.entries(rows)) {
    const inactive =
      r.pinnedAt === null &&
      r.dismissedAt === null &&
      (r.snoozedUntil === null || r.snoozedUntil <= now);
    if (r.updatedAt < cutoff && inactive) delete rows[id];
  }
  writeJson(FOCUS_KEY, rows);
  return Object.entries(rows).map(([itemId, r]) => ({
    itemId,
    pinnedAt: r.pinnedAt,
    snoozedUntil: r.snoozedUntil,
    dismissedAt: r.dismissedAt,
  }));
}

export async function setPin(itemId: string, pinned: boolean): Promise<void> {
  requireItemId(itemId);
  if (typeof pinned !== "boolean") throw new Error("pinned (boolean) required");
  upsert(itemId, { pinnedAt: pinned ? Date.now() : null });
}

export async function setSnooze(itemId: string, until: number | null): Promise<void> {
  requireItemId(itemId);
  if (until !== null && (typeof until !== "number" || !Number.isFinite(until))) {
    throw new Error("until must be a finite number or null");
  }
  upsert(itemId, { snoozedUntil: until });
}

export async function setDismiss(itemId: string, dismissed: boolean): Promise<void> {
  requireItemId(itemId);
  if (typeof dismissed !== "boolean") throw new Error("dismissed (boolean) required");
  upsert(itemId, { dismissedAt: dismissed ? Date.now() : null });
}
