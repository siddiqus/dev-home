import { Router, Request, Response } from "express";
import { getConfig } from "../config";
import { createJiraClient } from "../clients/jiraApiClient";
import { adfToMarkdown } from "../utils/adf";

const router = Router();

/**
 * GET /api/jira/issues
 * Fetch unresolved issues assigned to the current user.
 */
router.get("/issues", async (_req: Request, res: Response) => {
  const jira = createJiraClient();

  const jql = `assignee = currentUser() AND resolution = Unresolved AND statusCategory != Done AND updated >= -90d ORDER BY updated DESC`;
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
    self: issue.self,
    description: adfToMarkdown(issue.fields?.description),
  }));

  res.json({ issues });
});

/**
 * POST /api/jira/issues/bulk
 * Fetch issues by their keys (e.g. ["CCP-123", "CCP-456"]).
 */
router.post("/issues/bulk", async (req: Request, res: Response) => {
  const { keys } = req.body;
  if (!Array.isArray(keys) || keys.length === 0) {
    res.json({ issues: [] });
    return;
  }

  const jira = createJiraClient();
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
    self: issue.self,
    description: adfToMarkdown(issue.fields?.description),
    issueType: {
      name: issue.fields?.issuetype?.name || null,
      iconUrl: issue.fields?.issuetype?.iconUrl || null,
    },
  }));

  res.json({ issues });
});

/**
 * GET /api/jira/mentions
 * Fetch recent comments that mention the current user.
 */
router.get("/mentions", async (_req: Request, res: Response) => {
  const config = getConfig();
  const jira = createJiraClient();

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
          self: comment.self,
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

  res.json({ comments: allComments });
});

export default router;
