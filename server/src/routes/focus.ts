import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router();

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

interface FocusStateRow {
  item_id: string;
  pinned_at: number | null;
  snoozed_until: number | null;
  updated_at: number;
}

/**
 * GET /api/focus/state
 * Returns all pin/snooze rows. Garbage-collects rows older than 90 days with
 * no active pin and no future snooze.
 */
router.get("/state", (_req: Request, res: Response) => {
  const db = getDb();
  const now = Date.now();
  const cutoff = now - NINETY_DAYS_MS;

  db.prepare(
    `DELETE FROM focus_state
     WHERE updated_at < ?
       AND pinned_at IS NULL
       AND (snoozed_until IS NULL OR snoozed_until <= ?)`,
  ).run(cutoff, now);

  const rows = db.prepare("SELECT * FROM focus_state").all() as FocusStateRow[];
  res.json({
    items: rows.map((r) => ({
      itemId: r.item_id,
      pinnedAt: r.pinned_at,
      snoozedUntil: r.snoozed_until,
    })),
  });
});

/**
 * POST /api/focus/pin
 * Body: { itemId: string, pinned: boolean }
 * Upserts the row; sets pinned_at to now (or null to unpin).
 */
router.post("/pin", (req: Request, res: Response) => {
  const { itemId, pinned } = req.body ?? {};

  if (typeof itemId !== "string" || !itemId) {
    res.status(400).json({ error: "itemId (string) required" });
    return;
  }
  if (typeof pinned !== "boolean") {
    res.status(400).json({ error: "pinned (boolean) required" });
    return;
  }

  const db = getDb();
  const now = Date.now();
  const pinnedAt = pinned ? now : null;

  db.prepare(
    `INSERT INTO focus_state (item_id, pinned_at, snoozed_until, updated_at)
       VALUES (?, ?, NULL, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       pinned_at = excluded.pinned_at,
       updated_at = excluded.updated_at`,
  ).run(itemId, pinnedAt, now);

  res.json({ itemId, pinnedAt });
});

/**
 * POST /api/focus/snooze
 * Body: { itemId: string, until: number | null }   (epoch ms; null = clear)
 */
router.post("/snooze", (req: Request, res: Response) => {
  const { itemId, until } = req.body ?? {};

  if (typeof itemId !== "string" || !itemId) {
    res.status(400).json({ error: "itemId (string) required" });
    return;
  }
  if (until !== null && (typeof until !== "number" || !Number.isFinite(until))) {
    res.status(400).json({ error: "until must be a finite number or null" });
    return;
  }

  const db = getDb();
  const now = Date.now();

  db.prepare(
    `INSERT INTO focus_state (item_id, pinned_at, snoozed_until, updated_at)
       VALUES (?, NULL, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       snoozed_until = excluded.snoozed_until,
       updated_at = excluded.updated_at`,
  ).run(itemId, until, now);

  res.json({ itemId, snoozedUntil: until });
});

export default router;
