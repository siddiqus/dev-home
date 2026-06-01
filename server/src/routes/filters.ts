import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router();

/**
 * GET /api/filters
 * List all saved filters.
 */
router.get("/", (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM saved_filters ORDER BY created_at DESC").all();
  const filters = (rows as any[]).map((r) => ({
    ...r,
    filter_config: JSON.parse(r.filter_config),
  }));
  res.json({ filters });
});

/**
 * POST /api/filters
 * Create a new saved filter.
 */
router.post("/", (req: Request, res: Response) => {
  const db = getDb();
  const { name, filter_config } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  if (!filter_config || typeof filter_config !== "object") {
    res.status(400).json({ error: "filter_config is required and must be an object" });
    return;
  }

  const stmt = db.prepare("INSERT INTO saved_filters (name, filter_config) VALUES (?, ?)");
  const result = stmt.run(name.trim(), JSON.stringify(filter_config));

  const filter = db.prepare("SELECT * FROM saved_filters WHERE id = ?").get(result.lastInsertRowid) as any;
  res.status(201).json({
    filter: { ...filter, filter_config: JSON.parse(filter.filter_config) },
  });
});

/**
 * PUT /api/filters/:id
 * Update a saved filter.
 */
router.put("/:id", (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;
  const { name, filter_config } = req.body;

  if (!name && !filter_config) {
    res.status(400).json({ error: "At least one of name or filter_config is required" });
    return;
  }

  const existing = db.prepare("SELECT * FROM saved_filters WHERE id = ?").get(id);
  if (!existing) {
    res.status(404).json({ error: "Filter not found" });
    return;
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) {
    updates.push("name = ?");
    params.push(name.trim());
  }

  if (filter_config !== undefined) {
    updates.push("filter_config = ?");
    params.push(JSON.stringify(filter_config));
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`UPDATE saved_filters SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  const filter = db.prepare("SELECT * FROM saved_filters WHERE id = ?").get(id) as any;
  res.json({
    filter: { ...filter, filter_config: JSON.parse(filter.filter_config) },
  });
});

/**
 * DELETE /api/filters/:id
 * Delete a saved filter.
 */
router.delete("/:id", (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare("SELECT * FROM saved_filters WHERE id = ?").get(id);
  if (!existing) {
    res.status(404).json({ error: "Filter not found" });
    return;
  }

  db.prepare("DELETE FROM saved_filters WHERE id = ?").run(id);
  res.json({ success: true });
});

export default router;
