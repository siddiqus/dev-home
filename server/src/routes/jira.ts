import { Router, Request, Response } from "express";
import { getConfig } from "../config";

const router = Router();

/**
 * Build authorization header for JIRA (Basic auth with email:apiToken).
 */
function getJiraAuthHeaders() {
  const config = getConfig();
  const credentials = Buffer.from(`${config.jiraEmail}:${config.jiraApiToken}`).toString("base64");

  return {
    Authorization: `Basic ${credentials}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

/**
 * Recursively extract plain text from an Atlassian Document Format (ADF) node.
 */
function extractTextFromADF(node: any): string {
  if (!node) return "";

  if (typeof node === "string") return node;

  let text = "";

  if (node.text) {
    text += node.text;
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      text += extractTextFromADF(child);
    }
  }

  return text;
}

/**
 * GET /api/jira/issues
 * Fetch unresolved issues assigned to the current user.
 */
router.get("/issues", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const headers = getJiraAuthHeaders();

    const jql = `assignee = "${config.jiraEmail}" AND resolution = Unresolved ORDER BY updated DESC`;
    const fields = ["summary", "status", "priority", "assignee", "project", "updated"];

    const url = `${config.jiraBaseUrl}/rest/api/3/search/jql`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jql, fields }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[JIRA /issues] Error:", response.status, errorBody);
      return res.status(response.status).json({
        error: `JIRA API returned ${response.status}: ${errorBody}`,
      });
    }

    const data: any = await response.json();

    console.log("[JIRA /issues] Raw response keys:", Object.keys(data));
    console.log(
      "[JIRA /issues] Total:",
      data.total,
      "Count:",
      data.issues?.length ?? data.length ?? "N/A",
    );
    if (!data.issues && Array.isArray(data)) {
      console.log("[JIRA /issues] Response is array directly, length:", data.length);
    }

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
      assignee: {
        displayName: issue.fields?.assignee?.displayName,
        avatarUrls: issue.fields?.assignee?.avatarUrls,
      },
      project: {
        key: issue.fields?.project?.key,
        name: issue.fields?.project?.name,
      },
      updated: issue.fields?.updated,
      self: issue.self,
    }));

    res.json({ issues });
  } catch (err: any) {
    console.error("[JIRA /issues] Exception:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jira/mentions
 * Fetch recent comments that mention the current user.
 */
router.get("/mentions", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const headers = getJiraAuthHeaders();

    // Extract username from email (part before @)
    const username = config.jiraEmail.split("@")[0];

    const jql = `text ~ "${config.jiraEmail}" ORDER BY updated DESC`;
    const fields = ["summary"];
    const maxResults = 20;

    const searchUrl = `${config.jiraBaseUrl}/rest/api/3/search/jql`;

    const searchResponse = await fetch(searchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ jql, fields, maxResults }),
    });

    if (!searchResponse.ok) {
      const errorBody = await searchResponse.text();
      console.error("[JIRA /mentions] Search error:", searchResponse.status, errorBody);
      return res.status(searchResponse.status).json({
        error: `JIRA API returned ${searchResponse.status}: ${errorBody}`,
      });
    }

    const searchData: any = await searchResponse.json();
    const issues = searchData.issues || [];

    // Fetch comments for each issue in parallel
    const commentPromises = issues.map(async (issue: any) => {
      try {
        const commentUrl = `${config.jiraBaseUrl}/rest/api/3/issue/${issue.key}/comment`;
        const commentResponse = await fetch(commentUrl, { headers });

        if (!commentResponse.ok) {
          console.error(
            `[JIRA /mentions] Failed to fetch comments for ${issue.key}:`,
            commentResponse.status,
          );
          return [];
        }

        const commentData: any = await commentResponse.json();
        const comments = commentData.comments || [];

        // Filter comments that mention the user's email or username
        return comments
          .filter((comment: any) => {
            const bodyText = extractTextFromADF(comment.body).toLowerCase();
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
              text: extractTextFromADF(comment.body),
            },
            created: comment.created,
            updated: comment.updated,
            self: comment.self,
            issueKey: issue.key,
            issueSummary: issue.fields?.summary,
          }));
      } catch (err: any) {
        console.error(
          `[JIRA /mentions] Exception fetching comments for ${issue.key}:`,
          err.message,
        );
        return [];
      }
    });

    const commentArrays = await Promise.all(commentPromises);
    const allComments = commentArrays.flat();

    // Sort by updated DESC
    allComments.sort((a: any, b: any) => {
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });

    res.json({ comments: allComments });
  } catch (err: any) {
    console.error("[JIRA /mentions] Exception:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
