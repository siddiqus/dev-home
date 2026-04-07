import { Router, Request, Response } from "express";
import { getConfig } from "../config";
import { createGitHubClient } from "../clients/githubApiClient";
import { graphql } from "../clients/githubGraphqlClient";

const router = Router();

/**
 * Get an ISO date string for three months ago (YYYY-MM-DD).
 */
function threeMonthsAgoDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

const SEARCH_PRS_QUERY = `
  query SearchPRs($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          databaseId
          number
          title
          url
          state
          isDraft
          createdAt
          updatedAt
          author { login avatarUrl }
          body
          headRefName
          baseRefName
          repository { nameWithOwner url }
        }
      }
    }
  }
`;

/**
 * Map a GitHub GraphQL PullRequest node to the frontend GitHubPR shape.
 */
function mapGraphQLPr(node: any) {
  return {
    id: node.databaseId,
    number: node.number,
    title: node.title,
    html_url: node.url,
    state: node.state?.toLowerCase() || "open",
    draft: node.isDraft || false,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    user: {
      login: node.author?.login || "",
      avatar_url: node.author?.avatarUrl || "",
    },
    head: {
      ref: node.headRefName || "",
    },
    base: {
      ref: node.baseRefName || "",
    },
    body: node.body || "",
    repository_url: `https://api.github.com/repos/${node.repository?.nameWithOwner || ""}`,
    repo_full_name: node.repository?.nameWithOwner || "",
  };
}

/**
 * GET /api/github/prs
 * Fetch open pull requests authored by the configured user.
 */
router.get("/prs", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const q = `author:${config.githubUsername} type:pr state:open updated:>=${threeMonthsAgoDate()}`;

    const result = await graphql<{ search: { nodes: any[] } }>(SEARCH_PRS_QUERY, {
      query: q,
      first: 50,
    });

    const prs = (result.search.nodes || []).map(mapGraphQLPr);

    res.json({ prs });
  } catch (err: any) {
    const status = err.response?.status || 500;
    const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error("[GitHub /prs] Error:", status, message);
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/github/reviews
 * Fetch open PRs where the configured user's review is requested.
 */
router.get("/reviews", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const q = `review-requested:${config.githubUsername} type:pr state:open updated:>=${threeMonthsAgoDate()}`;

    const result = await graphql<{ search: { nodes: any[] } }>(SEARCH_PRS_QUERY, {
      query: q,
      first: 50,
    });

    const reviews = (result.search.nodes || []).map(mapGraphQLPr);

    res.json({ reviews });
  } catch (err: any) {
    const status = err.response?.status || 500;
    const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error("[GitHub /reviews] Error:", status, message);
    res.status(status).json({ error: message });
  }
});

const SEARCH_MENTIONS_QUERY = `
  query SearchMentions($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          databaseId
          number
          title
          url
          createdAt
          updatedAt
          author { login avatarUrl }
          body
          repository { nameWithOwner }
        }
      }
    }
  }
`;

/**
 * Map a GitHub GraphQL PullRequest node to the frontend GitHubComment shape.
 */
function mapGraphQLNodeToComment(node: any) {
  return {
    id: node.databaseId,
    html_url: node.url,
    body: node.body || "",
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    user: {
      login: node.author?.login || "",
      avatar_url: node.author?.avatarUrl || "",
    },
    issue_url: node.url,
    pr_number: node.number,
    repo_full_name: node.repository?.nameWithOwner || "",
    context_title: node.title || "",
  };
}

/**
 * Fetch notification comments with controlled concurrency.
 * Processes in batches to avoid overwhelming the API.
 */
async function fetchCommentsInBatches(
  notifications: any[],
  github: ReturnType<typeof createGitHubClient>,
  batchSize: number = 10
): Promise<any[]> {
  const targets = notifications.filter((n: any) => n.subject?.latest_comment_url);
  const results: any[] = [];

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (notification: any) => {
        try {
          const { data: comment } = await github.get(notification.subject.latest_comment_url);
          return {
            id: comment.id,
            html_url: comment.html_url,
            body: comment.body || "",
            created_at: comment.created_at,
            updated_at: comment.updated_at,
            user: {
              login: comment.user?.login,
              avatar_url: comment.user?.avatar_url,
            },
            issue_url: comment.issue_url || "",
            pr_number: null,
            repo_full_name: notification.repository?.full_name || "",
            context_title: notification.subject?.title || "",
          };
        } catch {
          return null;
        }
      })
    );
    results.push(...batchResults.filter(Boolean));
  }

  return results;
}

/**
 * GET /api/github/mentions
 * Fetch GitHub mentions from notifications (REST) and search results (GraphQL).
 */
router.get("/mentions", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const github = createGitHubClient();
    const cutoff = threeMonthsAgoDate();

    // Fetch from 2 sources in parallel: REST notifications + GraphQL PR mentions
    const [notificationsRes, prMentionsRes] = await Promise.allSettled([
      github.get("/notifications", {
        params: { participating: true, all: false, per_page: 50, since: `${cutoff}T00:00:00Z` },
      }),
      graphql<{ search: { nodes: any[] } }>(SEARCH_MENTIONS_QUERY, {
        query: `mentions:${config.githubUsername} type:pr state:open updated:>=${cutoff}`,
        first: 30,
      }),
    ]);

    const mentions: any[] = [];

    // Process notifications — fetch latest comment for each in controlled batches
    if (notificationsRes.status === "fulfilled") {
      const notifications = notificationsRes.value.data as any[];
      const comments = await fetchCommentsInBatches(notifications, github);
      mentions.push(...comments);
    } else {
      console.error("[GitHub /mentions] Notifications error:", notificationsRes.reason?.message);
    }

    // Process PR mentions from GraphQL search
    if (prMentionsRes.status === "fulfilled") {
      const nodes = prMentionsRes.value.search.nodes || [];
      mentions.push(...nodes.map(mapGraphQLNodeToComment));
    } else {
      console.error("[GitHub /mentions] PR search error:", prMentionsRes.reason?.message);
    }

    // Deduplicate by id
    const seen = new Set<number>();
    const deduplicated = mentions.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // Sort by updated_at DESC
    deduplicated.sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    res.json({ mentions: deduplicated });
  } catch (err: any) {
    const status = err.response?.status || 500;
    const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error("[GitHub /mentions] Error:", status, message);
    res.status(status).json({ error: message });
  }
});

export default router;
