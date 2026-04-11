import { Router, Request, Response } from "express";
import { getConfig } from "../config";
import { createGitHubClient } from "../clients/githubApiClient";
import { graphql } from "../clients/githubGraphqlClient";

const router = Router();

/**
 * Get an ISO date string for three months ago (YYYY-MM-DD).
 */
function monthsAgo(months: number = 1): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
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
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
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
    checks_status: node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state || null,
  };
}

/**
 * GET /api/github/prs
 * Fetch open pull requests authored by the configured user.
 */
router.get("/prs", async (_req: Request, res: Response) => {
  const config = getConfig();
  const q = `author:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  const result = await graphql<{ search: { nodes: any[] } }>(SEARCH_PRS_QUERY, {
    query: q,
    first: 50,
  });

  const prs = (result.search.nodes || [])
    .map(mapGraphQLPr)
    .filter((pr: any) => pr.state === "open");

  res.json({ prs });
});

/**
 * GET /api/github/reviews
 * Fetch open PRs where the configured user's review is requested.
 */
router.get("/reviews", async (_req: Request, res: Response) => {
  const config = getConfig();
  const q = `review-requested:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  const result = await graphql<{ search: { nodes: any[] } }>(SEARCH_PRS_QUERY, {
    query: q,
    first: 50,
  });

  const reviews = (result.search.nodes || [])
    .map(mapGraphQLPr)
    .filter((pr: any) => pr.state === "open");

  res.json({ reviews });
});

/**
 * Extract the issue/PR number from a GitHub API subject URL.
 * e.g. "https://api.github.com/repos/owner/repo/pulls/123" -> 123
 */
function extractSubjectNumber(url: string | undefined): number | null {
  if (!url) return null;
  const match = url.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Convert a GitHub API subject URL to a browser-facing HTML URL.
 * e.g. "https://api.github.com/repos/owner/repo/pulls/123"
 *   -> "https://github.com/owner/repo/pull/123"
 */
function subjectUrlToHtml(apiUrl: string | undefined, repoFullName: string): string {
  if (!apiUrl) return `https://github.com/${repoFullName}`;
  // /repos/owner/repo/pulls/123 -> /owner/repo/pull/123
  // /repos/owner/repo/issues/456 -> /owner/repo/issues/456
  const match = apiUrl.match(/repos\/(.+)\/(pulls|issues)\/(\d+)$/);
  if (!match) return `https://github.com/${repoFullName}`;
  const [, ownerRepo, type, number] = match;
  const htmlType = type === "pulls" ? "pull" : "issues";
  return `https://github.com/${ownerRepo}/${htmlType}/${number}`;
}

/** Bot usernames to filter out from mention notifications. */
const IGNORED_BOTS = ["github-actions", "datadog-official"];

const ALLOWED_REASONS = new Set([
  "approval_requested",
  "assign",
  "mention",
  "review_requested",
  "team_mention",
]);

/**
 * Fetch all pages of notifications from the GitHub REST API,
 * filtered to only relevant participation reasons.
 */
async function fetchAllNotifications(
  github: ReturnType<typeof createGitHubClient>,
  since: string,
): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await github.get("/notifications", {
      params: { participating: true, all: true, per_page: perPage, since, page },
    });
    for (const n of data) {
      if (ALLOWED_REASONS.has(n.reason)) all.push(n);
    }
    if (data.length < perPage) break;
    page++;
  }

  return all;
}

/**
 * Filter out notifications whose subject (PR/issue) is no longer open.
 * Fetches the subject URL in batches to check state.
 */
async function filterOpenNotifications(
  notifications: any[],
  github: ReturnType<typeof createGitHubClient>,
  batchSize: number = 10,
): Promise<any[]> {
  const results: any[] = [];

  for (let i = 0; i < notifications.length; i += batchSize) {
    const batch = notifications.slice(i, i + batchSize);
    const checked = await Promise.all(
      batch.map(async (notification: any) => {
        const subjectUrl = notification.subject?.url;
        if (!subjectUrl) return notification;
        try {
          const { data: subject } = await github.get(subjectUrl);
          // PRs have "state" (open/closed) and "merged" boolean
          // Issues have "state" (open/closed)
          if (subject.state && subject.state !== "open") return null;
          return notification;
        } catch {
          // If we can't fetch the subject, include it (fail open)
          return notification;
        }
      }),
    );
    results.push(...checked.filter(Boolean));
  }

  return results;
}

/**
 * Fetch notification comments with controlled concurrency.
 * Processes in batches to avoid overwhelming the API.
 */
async function fetchCommentsInBatches(
  notifications: any[],
  github: ReturnType<typeof createGitHubClient>,
  batchSize: number = 10,
): Promise<any[]> {
  const results: any[] = [];

  for (let i = 0; i < notifications.length; i += batchSize) {
    const batch = notifications.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (notification: any) => {
        const commentUrl = notification.subject?.latest_comment_url;
        try {
          if (commentUrl) {
            const { data: comment } = await github.get(commentUrl);
            return {
              id: comment.id,
              html_url: comment.html_url,
              body: comment.body || "",
              created_at: comment.created_at,
              updated_at: comment.updated_at,
              user: {
                login: comment.user?.login || "",
                avatar_url: comment.user?.avatar_url || "",
              },
              issue_url: comment.issue_url || "",
              pr_number: extractSubjectNumber(notification.subject?.url),
              repo_full_name: notification.repository?.full_name || "",
              context_title: notification.subject?.title || "",
              reason: notification.reason || "",
            };
          }
          // No comment URL — use notification-level info
          return {
            id: notification.id,
            html_url: subjectUrlToHtml(
              notification.subject?.url,
              notification.repository?.full_name || "",
            ),
            body: "",
            created_at: notification.updated_at,
            updated_at: notification.updated_at,
            user: { login: "", avatar_url: "" },
            issue_url: "",
            pr_number: extractSubjectNumber(notification.subject?.url),
            repo_full_name: notification.repository?.full_name || "",
            context_title: notification.subject?.title || "",
            reason: notification.reason || "",
          };
        } catch {
          return null;
        }
      }),
    );
    results.push(...batchResults.filter(Boolean));
  }

  return results;
}

/**
 * GET /api/github/mentions
 * Fetch GitHub mentions from the notifications API (participating, all, 2-month window).
 */
router.get("/mentions", async (_req: Request, res: Response) => {
  const github = createGitHubClient();
  const since = `${monthsAgo(2)}T00:00:00Z`;

  const allNotifications = await fetchAllNotifications(github, since);
  const notifications = await filterOpenNotifications(allNotifications, github);
  const mentions = await fetchCommentsInBatches(notifications, github);

  // Filter out bot mentions and deduplicate by id
  const seen = new Set<number | string>();
  const deduplicated = mentions.filter((m) => {
    if (!m.user?.login) return false;
    if (IGNORED_BOTS.some((bot) => m.user?.login.includes(bot))) return false;
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  // Sort by updated_at DESC
  deduplicated.sort((a, b) => {
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  res.json({ mentions: deduplicated });
});

export default router;
