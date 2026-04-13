import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router();

const VALID_ITEM_TYPES = ["note", "pr", "review"];
const VALID_COLUMNS = ["todo", "in_progress", "on_hold", "in_review", "done"];

/**
 * GET /api/kanban
 * Fetch all kanban items.
 */
router.get("/", (req: Request, res: Response) => {
  const db = getDb();
  const items = db.prepare("SELECT * FROM kanban_items ORDER BY column_name, position ASC").all();
  res.json({ items });
});

/**
 * POST /api/kanban
 * Upsert a kanban item.
 */
router.post("/", (req: Request, res: Response) => {
  const db = getDb();
  const { item_type, item_id, column_name, position } = req.body;

  if (!item_type || !VALID_ITEM_TYPES.includes(item_type)) {
    res.status(400).json({ error: `item_type must be one of: ${VALID_ITEM_TYPES.join(", ")}` });
    return;
  }

  if (!item_id) {
    res.status(400).json({ error: "item_id is required" });
    return;
  }

  if (!column_name || !VALID_COLUMNS.includes(column_name)) {
    res.status(400).json({ error: `column_name must be one of: ${VALID_COLUMNS.join(", ")}` });
    return;
  }

  const stmt = db.prepare(`
    INSERT INTO kanban_items (item_type, item_id, column_name, position)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(item_type, item_id) DO UPDATE SET
      column_name = excluded.column_name,
      position = excluded.position,
      updated_at = datetime('now')
  `);
  stmt.run(item_type, item_id, column_name, position ?? 0);

  const item = db
    .prepare("SELECT * FROM kanban_items WHERE item_type = ? AND item_id = ?")
    .get(item_type, item_id);
  res.status(201).json({ item });
});

/**
 * PUT /api/kanban/batch
 * Batch update positions for kanban items.
 */
router.put("/batch", (req: Request, res: Response) => {
  const db = getDb();
  const { items } = req.body;

  if (!Array.isArray(items)) {
    res.status(400).json({ error: "items must be an array" });
    return;
  }

  const updateStmt = db.prepare(`
    UPDATE kanban_items
    SET column_name = ?, position = ?, updated_at = datetime('now')
    WHERE item_type = ? AND item_id = ?
  `);

  const batchUpdate = db.transaction((entries: any[]) => {
    for (const entry of entries) {
      updateStmt.run(entry.column_name, entry.position ?? 0, entry.item_type, entry.item_id);
    }
  });

  batchUpdate(items);

  const allItems = db
    .prepare("SELECT * FROM kanban_items ORDER BY column_name, position ASC")
    .all();
  res.json({ items: allItems });
});

/**
 * DELETE /api/kanban/:itemType/:itemId
 * Remove a kanban item.
 */
router.delete("/:itemType/:itemId", (req: Request, res: Response) => {
  const db = getDb();
  const { itemType, itemId } = req.params;

  const existing = db
    .prepare("SELECT * FROM kanban_items WHERE item_type = ? AND item_id = ?")
    .get(itemType, itemId);

  if (!existing) {
    res.status(404).json({ error: "Kanban item not found" });
    return;
  }

  db.prepare("DELETE FROM kanban_items WHERE item_type = ? AND item_id = ?").run(itemType, itemId);
  res.json({ success: true });
});

export default router;
