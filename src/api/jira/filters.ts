import { jiraClient } from "../http";
import { ApiError } from "../http/errors";
import { BASE_ISSUE_FIELDS, mapIssue } from "./issues";

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
}): Promise<{ issues: any[]; nextPageToken: string | null }> {
  const { jql, nextPageToken } = args;

  if (!jql || typeof jql !== "string" || jql.trim().length === 0) {
    throw new ApiError(400, "jql is required");
  }

  const jira = jiraClient();
  const maxResults = 50;

  const payload: Record<string, any> = {
    jql: jql.trim(),
    fields: BASE_ISSUE_FIELDS,
    maxResults,
  };

  if (nextPageToken) {
    payload.nextPageToken = nextPageToken;
  }

  const { data } = await jira.post("/search/jql", payload);

  const issues = (data.issues || []).map((issue: any) => mapIssue(issue));

  return {
    issues,
    nextPageToken: data.nextPageToken || null,
  };
}
