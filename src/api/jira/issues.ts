import { jiraClient, requireSettings } from "../http";
import { adfToMarkdown } from "./adf";

/**
 * GET /api/jira/issues → getIssues()
 * Fetch unresolved issues assigned to the current user.
 */
export async function getIssues(): Promise<{ issues: any[] }> {
  const jira = jiraClient();

  const jql = `assignee = currentUser() AND resolution = Unresolved AND statusCategory != Done AND updated >= -90d ORDER BY updated DESC`;
  const fields = ["summary", "status", "priority", "assignee", "project", "created", "updated"];

  const { data } = await jira.post("/search/jql", { jql, fields });

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

  return { issues };
}

/**
 * POST /api/jira/issues/bulk → postIssuesBulk({ keys })
 * Fetch issues by their keys (e.g. ["CCP-123", "CCP-456"]).
 */
export async function postIssuesBulk(args: { keys: string[] }): Promise<{ issues: any[] }> {
  const { keys } = args;
  if (!Array.isArray(keys) || keys.length === 0) {
    return { issues: [] };
  }

  const jira = jiraClient();
  const keyList = keys.map((k: string) => `"${k}"`).join(", ");
  const jql = `key IN (${keyList}) ORDER BY updated DESC`;
  const fields = [
    "summary",
    "status",
    "priority",
    "assignee",
    "project",
    "created",
    "updated",
    "description",
    "issuetype",
  ];

  const { data } = await jira.post("/search/jql", { jql, fields });

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
    description: adfToMarkdown(issue.fields?.description),
    issueType: {
      name: issue.fields?.issuetype?.name || null,
      iconUrl: issue.fields?.issuetype?.iconUrl || null,
    },
  }));

  return { issues };
}

/**
 * GET /api/jira/mentions → getJiraMentions()
 * Fetch recent comments that mention the current user.
 */
export async function getJiraMentions(): Promise<{ comments: any[] }> {
  const config = requireSettings();
  const jira = jiraClient();

  // Extract username from email (part before @)
  const username = config.jiraEmail.split("@")[0];

  const jql = `text ~ "${config.jiraEmail}" AND resolution = Unresolved AND statusCategory != Done AND updated >= -90d ORDER BY updated DESC`;
  const fields = ["summary"];
  const maxResults = 20;

  const { data: searchData } = await jira.post("/search/jql", { jql, fields, maxResults });
  const issues = searchData.issues || [];

  // Fetch comments for each issue in parallel
  const commentPromises = issues.map(async (issue: any) => {
    try {
      const { data: commentData } = await jira.get(`/issue/${issue.key}/comment`);
      const comments = commentData.comments || [];

      // Filter comments that mention the user's email or username
      return comments
        .filter((comment: any) => {
          const bodyText = adfToMarkdown(comment.body).toLowerCase();
          return (
            bodyText.includes(config.jiraEmail.toLowerCase()) ||
            bodyText.includes(username.toLowerCase())
          );
        })
        .map((comment: any) => ({
          id: comment.id,
          author: {
            displayName: comment.author?.displayName,
            avatarUrls: comment.author?.avatarUrls,
          },
          body: {
            text: adfToMarkdown(comment.body),
          },
          created: comment.created,
          updated: comment.updated,
          issueKey: issue.key,
          issueSummary: issue.fields?.summary,
        }));
    } catch (err: any) {
      console.error(`[JIRA /mentions] Exception fetching comments for ${issue.key}:`, err.message);
      return [];
    }
  });

  const commentResults = await Promise.allSettled(commentPromises);
  const allComments = commentResults
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // Sort by updated DESC
  allComments.sort((a: any, b: any) => {
    return new Date(b.updated).getTime() - new Date(a.updated).getTime();
  });

  return { comments: allComments };
}
