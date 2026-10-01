import { jiraClient } from "../http";
import { ApiError } from "../http/errors";

/**
 * GET /api/jira-filters/remote → getRemoteFilters()
 * JIRA Remote Filters (user's own filters)
 */
export async function getRemoteFilters(): Promise<{ filters: any[] }> {
  const jira = jiraClient();
  const { data } = await jira.get("/filter/my");
  const filters = (Array.isArray(data) ? data : []).map((f: any) => ({
    id: f.id,
    name: f.name,
    jql: f.jql,
    favourite: f.favourite,
  }));
  return { filters };
}

/**
 * POST /api/jira-filters/search → postJqlSearch({ jql, nextPageToken })
 * JQL Search
 */
export async function postJqlSearch(args: {
  jql: string;
  nextPageToken?: string | null;
}): Promise<{ issues: any[]; total: number; nextPageToken: string | null }> {
  const { jql, nextPageToken } = args;

  if (!jql || typeof jql !== "string" || jql.trim().length === 0) {
    throw new ApiError(400, "jql is required");
  }

  const jira = jiraClient();
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

  return {
    issues,
    total: data.total || issues.length,
    nextPageToken: data.nextPageToken || null,
  };
}
