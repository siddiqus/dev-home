import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { createJiraClient } from "../clients/jiraApiClient";

const router = Router();

// ── Local JQL Filters (CRUD) ────────────────────────────────────────────

router.get("/", (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM jira_jql_filters ORDER BY updated_at DESC").all();
  res.json({ filters: rows });
});

router.post("/", (req: Request, res: Response) => {
  const db = getDb();
  const { name, jql } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!jql || typeof jql !== "string" || jql.trim().length === 0) {
    res.status(400).json({ error: "jql is required" });
    return;
  }

  const stmt = db.prepare("INSERT INTO jira_jql_filters (name, jql) VALUES (?, ?)");
  const result = stmt.run(name.trim(), jql.trim());
  const filter = db
    .prepare("SELECT * FROM jira_jql_filters WHERE id = ?")
    .get(result.lastInsertRowid);
  res.status(201).json({ filter });
});

router.put("/:id", (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;
  const { name, jql } = req.body;

  if (!name && !jql) {
    res.status(400).json({ error: "At least one of name or jql is required" });
    return;
  }

  const existing = db.prepare("SELECT * FROM jira_jql_filters WHERE id = ?").get(id);
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
  if (jql !== undefined) {
    updates.push("jql = ?");
    params.push(jql.trim());
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`UPDATE jira_jql_filters SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  const filter = db.prepare("SELECT * FROM jira_jql_filters WHERE id = ?").get(id);
  res.json({ filter });
});

router.delete("/:id", (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare("SELECT * FROM jira_jql_filters WHERE id = ?").get(id);
  if (!existing) {
    res.status(404).json({ error: "Filter not found" });
    return;
  }

  db.prepare("DELETE FROM jira_jql_filters WHERE id = ?").run(id);
  res.json({ success: true });
});

// ── JIRA Remote Filters (user's own filters) ───────────────────────────

router.get("/remote", async (_req: Request, res: Response) => {
  const jira = createJiraClient();
  const { data } = await jira.get("/filter/my");
  const filters = (Array.isArray(data) ? data : []).map((f: any) => ({
    id: f.id,
    name: f.name,
    jql: f.jql,
    favourite: f.favourite,
  }));
  res.json({ filters });
});

// ── JQL Search ──────────────────────────────────────────────────────────

router.post("/search", async (req: Request, res: Response) => {
  const { jql, nextPageToken } = req.body;

  if (!jql || typeof jql !== "string" || jql.trim().length === 0) {
    res.status(400).json({ error: "jql is required" });
    return;
  }

  const jira = createJiraClient();
  const fields = [
    "summary",
    "status",
    "priority",
    "assignee",
    "project",
    "created",
    "updated",
    "description",
  ];
  const maxResults = 50;

  const payload: Record<string, any> = { jql: jql.trim(), fields, maxResults };
  if (nextPageToken) {
    payload.nextPageToken = nextPageToken;
  }

  const { data } = await jira.post("/search/jql", payload);

  const issues = (data.issues || data || []).map((issue: any) => ({
    key: issue.key,
    summary: issue.fields?.summary,
    status: {
      name: issue.fields?.status?.name,
      statusCategory: {
        colorName: issue.fields?.status?.statusCategory?.colorName,
      },
    },
    priority: {
      name: issue.fields?.priority?.name,
      iconUrl: issue.fields?.priority?.iconUrl,
    },
    assignee: issue.fields?.assignee
      ? {
          displayName: issue.fields.assignee.displayName,
          avatarUrls: issue.fields.assignee.avatarUrls,
        }
      : null,
    project: {
      key: issue.fields?.project?.key,
      name: issue.fields?.project?.name,
    },
    created: issue.fields?.created,
    updated: issue.fields?.updated,
    self: issue.self,
  }));

  res.json({
    issues,
    total: data.total || issues.length,
    nextPageToken: data.nextPageToken || null,
  });
});

export default router;
