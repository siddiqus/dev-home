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

export default router;
