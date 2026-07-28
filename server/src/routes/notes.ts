import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router();

const VALID_TYPES = ["free_text", "jira_ticket", "github_pr", "link"];

/**
 * Validate a remind_at value. Accepts null/undefined (no reminder) or a string
 * that parses to a valid date. Past dates are valid (overdue reminders are
 * allowed). Numbers, objects, empty strings, and unparseable strings are invalid.
 */
export function isValidRemindAt(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value !== "string" || value === "") {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
}

/**
 * GET /api/notes
 * List all notes, optionally filtered by resolved status.
 */
router.get("/", (req: Request, res: Response) => {
  const db = getDb();
  const { resolved } = req.query;

  let sql = "SELECT * FROM notes";
  const params: any[] = [];

  if (resolved !== undefined) {
    sql += " WHERE resolved = ?";
    params.push(resolved === "true" ? 1 : 0);
  }

  sql += " ORDER BY pinned DESC, created_at DESC";

  const notes = db.prepare(sql).all(...params);
  res.json({ notes });
});

/**
 * POST /api/notes
 * Create a new note.
 */
router.post("/", (req: Request, res: Response) => {
  const db = getDb();
  const { type, content, reference_id, title, remind_at } = req.body;

  if (!type || !VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }

  if ((type === "jira_ticket" || type === "github_pr" || type === "link") && !reference_id) {
    res.status(400).json({ error: `reference_id is required for type '${type}'` });
    return;
  }

  if (remind_at !== undefined && !isValidRemindAt(remind_at)) {
    res.status(400).json({ error: "remind_at must be a valid date or null" });
    return;
  }

  const stmt = db.prepare(
    "INSERT INTO notes (type, title, content, reference_id, remind_at) VALUES (?, ?, ?, ?, ?)",
  );
  const result = stmt.run(
    type,
    title || "",
    content || "",
    reference_id || null,
    remind_at ?? null,
  );

  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ note });
});

/**
 * PATCH /api/notes/:id
 * Update an existing note.
 */
router.patch("/:id", (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;
  const { resolved, content, reference_id, title, pinned, remind_at } = req.body;

  const existing = db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
  if (!existing) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  const setClauses: string[] = [];
  const params: any[] = [];

  if (resolved !== undefined) {
    setClauses.push("resolved = ?");
    params.push(resolved ? 1 : 0);
  }

  if (pinned !== undefined) {
    setClauses.push("pinned = ?");
    params.push(pinned ? 1 : 0);
  }

  if (title !== undefined) {
    setClauses.push("title = ?");
    params.push(title);
  }

  if (content !== undefined) {
    setClauses.push("content = ?");
    params.push(content);
  }

  if (reference_id !== undefined) {
    setClauses.push("reference_id = ?");
    params.push(reference_id);
  }

  if (remind_at !== undefined) {
    if (!isValidRemindAt(remind_at)) {
      res.status(400).json({ error: "remind_at must be a valid date or null" });
      return;
    }
    setClauses.push("remind_at = ?");
    params.push(remind_at);
  }

  setClauses.push("updated_at = datetime('now')");

  const sql = `UPDATE notes SET ${setClauses.join(", ")} WHERE id = ?`;
  params.push(id);

  db.prepare(sql).run(...params);

  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
  res.json({ note });
});

/**
 * DELETE /api/notes/:id
 * Delete a note.
 */
router.delete("/:id", (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
  if (!existing) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  db.prepare("DELETE FROM notes WHERE id = ?").run(id);
  res.json({ success: true });
});

export default router;
