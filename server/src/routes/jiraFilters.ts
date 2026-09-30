import type { ApiRequest as Request, ApiResponse as Response } from "../http/nextHandler";
import { createJiraClient } from "../clients/jiraApiClient";

// ── JIRA Remote Filters (user's own filters) ───────────────────────────

export async function getRemoteFilters(_req: Request, res: Response) {
  const jira = createJiraClient();
  const { data } = await jira.get("/filter/my");
  const filters = (Array.isArray(data) ? data : []).map((f: any) => ({
    id: f.id,
    name: f.name,
    jql: f.jql,
    favourite: f.favourite,
  }));
  res.json({ filters });
}

// ── JQL Search ──────────────────────────────────────────────────────────

export async function postJqlSearch(req: Request, res: Response) {
  const { jql, nextPageToken } = req.body;

  if (!jql || typeof jql !== "string" || jql.trim().length === 0) {
    res.status(400).json({ error: "jql is required" });
    return;
  }

  const jira = createJiraClient();
  const fields = ["summary", "status", "priority", "assignee", "project", "created", "updated"];
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
  }));

  res.json({
    issues,
    total: data.total || issues.length,
    nextPageToken: data.nextPageToken || null,
  });
}
