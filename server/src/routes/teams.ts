import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router();

/** GET /api/teams — list teams with member counts. */
router.get("/", (_req: Request, res: Response) => {
  const db = getDb();
  const teams = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS member_count
       FROM teams t ORDER BY t.name COLLATE NOCASE`,
    )
    .all();
  res.json({ teams });
});

/** POST /api/teams — create a team. Body: { name, boardId?, boardName? } */
router.post("/", (req: Request, res: Response) => {
  const { name, boardId, boardName } = req.body || {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const db = getDb();
  const result = db
    .prepare("INSERT INTO teams (name, jira_board_id, jira_board_name) VALUES (?, ?, ?)")
    .run(name.trim(), boardId ?? null, boardName ?? null);
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(result.lastInsertRowid);
  res.json({ team });
});

/** PUT /api/teams/:id — update name/board. */
router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { name, boardId, boardName } = req.body || {};
  const db = getDb();
  const existing = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
  if (!existing) {
    res.status(404).json({ error: "team not found" });
    return;
  }
  db.prepare(
    "UPDATE teams SET name = ?, jira_board_id = ?, jira_board_name = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(name ?? (existing as any).name, boardId ?? null, boardName ?? null, id);
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
  res.json({ team });
});

/** DELETE /api/teams/:id — delete team and its members. */
router.delete("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM team_members WHERE team_id = ?").run(id);
    db.prepare("DELETE FROM teams WHERE id = ?").run(id);
  })();
  res.json({ ok: true });
});

/** GET /api/teams/:id/members */
router.get("/:id/members", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();
  const members = db
    .prepare("SELECT * FROM team_members WHERE team_id = ? ORDER BY display_name COLLATE NOCASE")
    .all(id);
  res.json({ members });
});

/** POST /api/teams/:id/members — Body: { displayName, jiraAccountId, jiraEmail?, githubUsername } */
router.post("/:id/members", (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id, 10);
  const { displayName, jiraAccountId, jiraEmail, githubUsername } = req.body || {};
  if (!displayName || !jiraAccountId || !githubUsername) {
    res.status(400).json({ error: "displayName, jiraAccountId, githubUsername are required" });
    return;
  }
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO team_members (team_id, display_name, jira_account_id, jira_email, github_username)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(teamId, displayName, jiraAccountId, jiraEmail ?? null, githubUsername);
  const member = db.prepare("SELECT * FROM team_members WHERE id = ?").get(result.lastInsertRowid);
  res.json({ member });
});

/** DELETE /api/teams/:teamId/members/:memberId */
router.delete("/:teamId/members/:memberId", (req: Request, res: Response) => {
  const memberId = parseInt(req.params.memberId, 10);
  const db = getDb();
  db.prepare("DELETE FROM team_members WHERE id = ?").run(memberId);
  res.json({ ok: true });
});

export default router;
