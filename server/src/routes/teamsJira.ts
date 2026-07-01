import { Router, Request, Response } from "express";
import { createJiraClient, createJiraAgileClient } from "../clients/jiraApiClient";

const router = Router();

/**
 * GET /api/teams-jira/users/search?q=
 * Type-ahead search for Jira users. Returns accountId (stable match key),
 * displayName, emailAddress (often null due to privacy), and a small avatar.
 */
router.get("/users/search", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.json({ users: [] });
    return;
  }
  const jira = createJiraClient();
  const { data } = await jira.get("/user/search", { params: { query: q, maxResults: 20 } });
  const users = (data || []).map((u: any) => ({
    accountId: u.accountId,
    displayName: u.displayName,
    emailAddress: u.emailAddress || null,
    avatarUrl: u.avatarUrls?.["24x24"] || "",
  }));
  res.json({ users });
});

/**
 * GET /api/teams-jira/boards/search?q=
 * Search scrum boards by name. Returns id, name, and project location.
 */
router.get("/boards/search", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const agile = createJiraAgileClient();
  const boards: any[] = [];
  let startAt = 0;
  const maxResults = 50;
  // Paginate until isLast; cap at 200 to bound latency.
  while (boards.length < 200) {
    const { data } = await agile.get("/board", {
      params: { type: "scrum", name: q || undefined, startAt, maxResults },
    });
    for (const b of data.values || []) {
      boards.push({
        id: b.id,
        name: b.name,
        projectKey: b.location?.projectKey || "",
        projectName: b.location?.projectName || "",
      });
    }
    if (data.isLast || (data.values || []).length < maxResults) break;
    startAt += maxResults;
  }
  res.json({ boards });
});

/**
 * GET /api/teams-jira/boards/:id/sprints
 * Return active + recent closed sprints for a board, newest first.
 */
router.get("/boards/:id/sprints", async (req: Request, res: Response) => {
  const boardId = parseInt(req.params.id, 10);
  if (isNaN(boardId)) {
    res.status(400).json({ error: "invalid board id" });
    return;
  }
  const agile = createJiraAgileClient();
  const sprints: any[] = [];
  let startAt = 0;
  const maxResults = 50;
  while (sprints.length < 200) {
    const { data } = await agile.get(`/board/${boardId}/sprint`, {
      params: { state: "active,closed", startAt, maxResults },
    });
    for (const s of data.values || []) {
      sprints.push({
        id: s.id,
        name: s.name,
        state: s.state,
        startDate: s.startDate,
        endDate: s.endDate,
      });
    }
    if (data.isLast || (data.values || []).length < maxResults) break;
    startAt += maxResults;
  }
  // Active first, then closed by most recent end date.
  sprints.sort((a, b) => {
    if (a.state === "active" && b.state !== "active") return -1;
    if (b.state === "active" && a.state !== "active") return 1;
    return new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime();
  });
  res.json({ sprints });
});

export default router;
