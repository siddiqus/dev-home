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

function hoursAgo(hours: number): string {
  const d = new Date();
  d.setTime(d.getTime() - hours * 60 * 60 * 1000);
  return d.toISOString();
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
                  contexts(first: 50) {
                    nodes {
                      ... on CheckRun {
                        name
                        conclusion
                        status
                        detailsUrl
                      }
                      ... on StatusContext {
                        context
                        state
                        targetUrl
                      }
                    }
                  }
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
 * Extended query for user's own PRs. Adds review state and recent comments
 * so we can show approval status and surface comments without extra REST calls.
 */
const SEARCH_MY_PRS_QUERY = `
  query SearchMyPRs($query: String!, $first: Int!) {
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
                  contexts(first: 50) {
                    nodes {
                      ... on CheckRun {
                        name
                        conclusion
                        status
                        detailsUrl
                      }
                      ... on StatusContext {
                        context
                        state
                        targetUrl
                      }
                    }
                  }
                }
              }
            }
          }
          reviews(last: 20) {
            nodes {
              state
              author { login avatarUrl }
              submittedAt
            }
          }
          comments(last: 50) {
            nodes {
              databaseId
              url
              body
              createdAt
              updatedAt
              author { login avatarUrl }
            }
          }
          reviewThreads(last: 50) {
            nodes {
              comments(last: 10) {
                nodes {
                  databaseId
                  url
                  body
                  createdAt
                  updatedAt
                  author { login avatarUrl }
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
 * Map a statusCheckRollup context node to a normalized check run shape.
 */
function mapCheckContext(ctx: any) {
  // CheckRun nodes have `name`, `conclusion`, `status`, `detailsUrl`
  if (ctx.name !== undefined) {
    return {
      name: ctx.name,
      status: (ctx.conclusion || ctx.status || "PENDING").toUpperCase(),
      url: ctx.detailsUrl || null,
    };
  }
  // StatusContext nodes have `context`, `state`, `targetUrl`
  return {
    name: ctx.context || "",
    status: (ctx.state || "PENDING").toUpperCase(),
    url: ctx.targetUrl || null,
  };
}

/**
 * Derive an overall review status from a list of review nodes.
 * Returns "APPROVED", "CHANGES_REQUESTED", "REVIEWED", or null.
 * Uses the latest review per author to determine the current state.
 */
function deriveReviewStatus(reviews: any[] | undefined): string | null {
  if (!reviews || reviews.length === 0) return null;

  // Keep only the latest review per author
  const latestByAuthor = new Map<string, string>();
  for (const r of reviews) {
    const login = r.author?.login || "";
    if (!login) continue;
    // reviews are ordered oldest-first from the API; later entries overwrite
    latestByAuthor.set(login, r.state);
  }

  const states = [...latestByAuthor.values()];
  if (states.some((s) => s === "CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (states.some((s) => s === "APPROVED")) return "APPROVED";
  if (states.length > 0) return "REVIEWED";
  return null;
}

/**
 * Map a GitHub GraphQL PullRequest node to the frontend GitHubPR shape.
 */
function mapGraphQLPr(node: any) {
  const rollup = node.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  const contextNodes = rollup?.contexts?.nodes || [];
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
    checks_status: rollup?.state || null,
    checks: contextNodes.map(mapCheckContext),
    review_status: deriveReviewStatus(node.reviews?.nodes),
    merged_at: node.mergedAt || null,
  };
}

/**
 * GET /api/github/prs
 * Fetch open pull requests authored by the configured user.
 * Uses the extended query to include review/approval status and comments.
 * Also returns pr_comments: comments on the user's PRs by other people (non-bot),
 * so the frontend can merge them into mentions without a second GraphQL call.
 */
router.get("/prs", async (_req: Request, res: Response) => {
  const config = getConfig();
  const q = `author:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  const result = await graphql<{ search: { nodes: any[] } }>(SEARCH_MY_PRS_QUERY, {
    query: q,
    first: 50,
  });

  const nodes = result.search.nodes || [];
  const prs = nodes.map(mapGraphQLPr).filter((pr: any) => pr.state === "open");
  const prComments = extractOwnPRComments(nodes, config.githubUsername);

  res.json({ prs, pr_comments: prComments });
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
const IGNORED_BOTS = [
  "github-actions",
  "datadog-official",
  "copilot",
  "dependabot",
  "renovate",
  "codecov",
  "sonarcloud",
  "netlify",
  "vercel",
];

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
 * Check if a username looks like a bot account.
 */
function isBot(login: string): boolean {
  if (!login) return true;
  const lower = login.toLowerCase();
  if (IGNORED_BOTS.some((bot) => lower.includes(bot))) return true;
  // GitHub bot accounts typically end with [bot]
  if (lower.endsWith("[bot]")) return true;
  return false;
}

/**
 * Extract comments from GraphQL PR nodes (issue comments + review thread comments).
 * Returns flattened GitHubComment-shaped objects for the user's own open PRs,
 * excluding the user's own comments and bot comments.
 */
function extractOwnPRComments(prNodes: any[], username: string): any[] {
  const comments: any[] = [];

  for (const pr of prNodes) {
    if (pr.state?.toLowerCase() !== "open") continue;
    const repoFullName = pr.repository?.nameWithOwner || "";

    // Issue-level comments (general PR comments)
    for (const c of pr.comments?.nodes || []) {
      const login = c.author?.login || "";
      if (login === username) continue;
      if (isBot(login)) continue;
      comments.push({
        id: c.databaseId,
        html_url: c.url,
        body: c.body || "",
        created_at: c.createdAt,
        updated_at: c.updatedAt,
        user: { login, avatar_url: c.author?.avatarUrl || "" },
        issue_url: "",
        pr_number: pr.number,
        repo_full_name: repoFullName,
        context_title: pr.title || "",
        reason: "comment",
      });
    }

    // Review thread comments (inline code comments)
    for (const thread of pr.reviewThreads?.nodes || []) {
      for (const c of thread.comments?.nodes || []) {
        const login = c.author?.login || "";
        if (login === username) continue;
        if (isBot(login)) continue;
        comments.push({
          id: c.databaseId,
          html_url: c.url,
          body: c.body || "",
          created_at: c.createdAt,
          updated_at: c.updatedAt,
          user: { login, avatar_url: c.author?.avatarUrl || "" },
          issue_url: "",
          pr_number: pr.number,
          repo_full_name: repoFullName,
          context_title: pr.title || "",
          reason: "comment",
        });
      }
    }
  }

  return comments;
}

/**
 * GraphQL query for fetching all comments on a single PR.
 */
const PR_COMMENTS_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        comments(last: 100) {
          nodes {
            databaseId
            url
            body
            createdAt
            updatedAt
            author { login avatarUrl }
          }
        }
        reviewThreads(last: 100) {
          nodes {
            isResolved
            comments(last: 10) {
              nodes {
                databaseId
                url
                body
                createdAt
                updatedAt
                author { login avatarUrl }
                path
                line
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * GraphQL query for org PRs with cursor-based pagination.
 */
const SEARCH_ORG_PRS_QUERY = `
  query SearchOrgPRs($query: String!, $first: Int!, $after: String) {
    search(query: $query, type: ISSUE, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
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
                  contexts(first: 50) {
                    nodes {
                      ... on CheckRun {
                        name
                        conclusion
                        status
                        detailsUrl
                      }
                      ... on StatusContext {
                        context
                        state
                        targetUrl
                      }
                    }
                  }
                }
              }
            }
          }
          reviews(last: 20) {
            nodes {
              state
              author { login avatarUrl }
              submittedAt
            }
          }
        }
      }
    }
  }
`;

/**
 * GET /api/github/org-prs
 * Fetch open, non-draft PRs for the configured org, sorted by most recent.
 * Supports cursor-based pagination via ?cursor= and optional ?author= and ?repo= filters.
 */
router.get("/org-prs", async (req: Request, res: Response) => {
  const config = getConfig();
  const org = config.githubOrg;

  if (!org) {
    res.json({ prs: [], pageInfo: { hasNextPage: false, endCursor: null } });
    return;
  }

  const author = typeof req.query.author === "string" ? req.query.author.trim() : "";
  const repo = typeof req.query.repo === "string" ? req.query.repo.trim() : "";
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

  // repo: and org: are mutually exclusive in GitHub search;
  // when a specific repo is selected, scope to that repo instead of the whole org.
  let q = repo
    ? `repo:${repo} type:pr state:open draft:false sort:updated-desc`
    : `org:${org} type:pr state:open draft:false sort:updated-desc`;
  if (author) {
    q += ` author:${author}`;
  }

  const result = await graphql<{
    search: { nodes: any[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  }>(SEARCH_ORG_PRS_QUERY, {
    query: q,
    first: 10,
    after: cursor || null,
  });

  const nodes = result.search.nodes || [];
  const prs = nodes.map(mapGraphQLPr).filter((pr: any) => pr.state === "open" && !pr.draft);

  res.json({ prs, pageInfo: result.search.pageInfo });
});

/**
 * GET /api/github/org-prs-multi-repo
 * Fetch open, non-draft PRs across multiple repos using aliased repository() GraphQL queries.
 * Accepts ?repos=owner/repo1,owner/repo2 and optional ?author=login (single).
 */
router.get("/org-prs-multi-repo", async (req: Request, res: Response) => {
  const repoParam = typeof req.query.repos === "string" ? req.query.repos.trim() : "";
  const author = typeof req.query.author === "string" ? req.query.author.trim() : "";

  const repoList = repoParam
    ? repoParam
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
    : [];
  if (repoList.length === 0) {
    res.json({ prs: [] });
    return;
  }

  // Build PR fragment for each repo
  const prFragment = `
    fragment PRFields on PullRequest {
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
              contexts(first: 50) {
                nodes {
                  ... on CheckRun {
                    name
                    conclusion
                    status
                    detailsUrl
                  }
                  ... on StatusContext {
                    context
                    state
                    targetUrl
                  }
                }
              }
            }
          }
        }
      }
      reviews(last: 20) {
        nodes {
          state
          author { login avatarUrl }
          submittedAt
        }
      }
    }
  `;

  // Build aliased repository queries
  const repoQueries = repoList.map((fullName, i) => {
    const [owner, name] = fullName.split("/");
    return `repo${i}: repository(owner: "${owner}", name: "${name}") {
      pullRequests(states: OPEN, first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes { ...PRFields }
      }
    }`;
  });

  const query = `
    ${prFragment}
    query MultiRepoPRs {
      ${repoQueries.join("\n      ")}
    }
  `;

  const result = await graphql<Record<string, any>>(query);

  // Collect all PRs from all repos
  const allPrs: any[] = [];
  for (const key of Object.keys(result)) {
    const nodes = result[key]?.pullRequests?.nodes || [];
    allPrs.push(...nodes);
  }

  let prs = allPrs.map(mapGraphQLPr).filter((pr: any) => pr.state === "open" && !pr.draft);

  // Filter by author if specified
  if (author) {
    const authorLower = author.toLowerCase();
    prs = prs.filter((pr: any) => pr.user.login.toLowerCase() === authorLower);
  }

  // Sort by updated_at descending
  prs.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  res.json({ prs });
});

/**
 * GET /api/github/org-members
 * Fetch members of the configured org for the author filter dropdown.
 */
router.get("/org-members", async (_req: Request, res: Response) => {
  const config = getConfig();
  const org = config.githubOrg;

  if (!org) {
    res.json({ members: [] });
    return;
  }

  const github = createGitHubClient();
  const members: Array<{ login: string; avatar_url: string }> = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await github.get(`/orgs/${org}/members`, {
      params: { per_page: perPage, page },
    });
    for (const m of data) {
      members.push({ login: m.login, avatar_url: m.avatar_url });
    }
    if (data.length < perPage) break;
    page++;
  }

  members.sort((a, b) => a.login.localeCompare(b.login));
  res.json({ members });
});

/**
 * GET /api/github/org-repos
 * Fetch the 40 most recently pushed repositories in the configured org.
 */
router.get("/org-repos", async (_req: Request, res: Response) => {
  const config = getConfig();
  const org = config.githubOrg;

  if (!org) {
    res.json({ repos: [] });
    return;
  }

  const github = createGitHubClient();
  const { data } = await github.get(`/orgs/${org}/repos`, {
    params: { per_page: 40, page: 1, sort: "pushed", direction: "desc" },
  });

  const repos = data.map((r: any) => ({ full_name: r.full_name, name: r.name }));
  res.json({ repos });
});

/**
 * GET /api/github/mentions
 * Fetch GitHub mentions from the notifications API (participating, all, 2-month window).
 * Note: comments on the user's own PRs are returned by GET /api/github/prs as pr_comments
 * and merged on the frontend, avoiding a duplicate GraphQL call.
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
    if (isBot(m.user.login)) return false;
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

/**
 * Lightweight GraphQL query for recently merged PRs (no checks/reviews needed).
 */
const SEARCH_MERGED_PRS_QUERY = `
  query SearchMergedPRs($query: String!, $first: Int!) {
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
          mergedAt
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
 * GET /api/github/merged-prs
 * Fetch recently merged PRs (last 3 hours).
 * ?scope=user (default) — user's own merged PRs
 * ?scope=org — org-wide merged PRs
 * Optional: ?author=login, ?repo=owner/repo
 */
router.get("/merged-prs", async (req: Request, res: Response) => {
  const config = getConfig();
  const scope = typeof req.query.scope === "string" ? req.query.scope : "user";
  const author = typeof req.query.author === "string" ? req.query.author.trim() : "";
  const repo = typeof req.query.repo === "string" ? req.query.repo.trim() : "";
  const since = hoursAgo(3);

  let q: string;

  if (scope === "org") {
    const org = config.githubOrg;
    if (!org) {
      res.json({ prs: [] });
      return;
    }
    q = repo
      ? `repo:${repo} type:pr is:merged merged:>=${since}`
      : `org:${org} type:pr is:merged merged:>=${since}`;
    if (author) {
      q += ` author:${author}`;
    }
  } else {
    q = `author:${config.githubUsername} type:pr is:merged merged:>=${since}`;
  }

  const result = await graphql<{ search: { nodes: any[] } }>(SEARCH_MERGED_PRS_QUERY, {
    query: q,
    first: 20,
  });

  const prs = (result.search.nodes || []).map(mapGraphQLPr);
  res.json({ prs });
});

/**
 * GET /github/job-logs?owner=OWNER&repo=REPO&job_id=JOB_ID
 * Proxies GitHub Actions job log download through the backend so the
 * browser doesn't need a token.
 */
router.get("/job-logs", async (req: Request, res: Response) => {
  const owner = typeof req.query.owner === "string" ? req.query.owner.trim() : "";
  const repo = typeof req.query.repo === "string" ? req.query.repo.trim() : "";
  const jobId = typeof req.query.job_id === "string" ? req.query.job_id.trim() : "";

  if (!owner || !repo || !jobId) {
    res.status(400).json({ error: "owner, repo, and job_id are required" });
    return;
  }

  try {
    const gh = createGitHubClient();
    const response = await gh.get(`/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, {
      maxRedirects: 5,
      responseType: "text",
    });
    res.type("text/plain").send(response.data);
  } catch (err: any) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || err.message || "Failed to fetch logs";
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/github/prs/:owner/:repo/:number/comments
 * Fetch all comments on a single PR (conversation + review threads).
 * Returns { conversation: ConversationComment[], review: ReviewComment[] }
 */
router.get("/prs/:owner/:repo/:number/comments", async (req: Request, res: Response) => {
  const { owner, repo } = req.params;
  const number = parseInt(req.params.number, 10);

  if (!owner || !repo || isNaN(number)) {
    res.status(400).json({ error: "owner, repo, and number are required" });
    return;
  }

  try {
    const result = await graphql<{
      repository: {
        pullRequest: {
          comments: { nodes: any[] };
          reviewThreads: { nodes: any[] };
        };
      };
    }>(PR_COMMENTS_QUERY, { owner, repo, number });

    const pr = result.repository?.pullRequest;
    if (!pr) {
      res.status(404).json({ error: "Pull request not found" });
      return;
    }

    // Extract conversation comments (non-bot)
    const conversationComments = (pr.comments?.nodes || [])
      .filter((c: any) => !isBot(c.author?.login || ""))
      .map((c: any) => ({
        id: c.databaseId,
        html_url: c.url,
        body: c.body || "",
        created_at: c.createdAt,
        updated_at: c.updatedAt,
        user: {
          login: c.author?.login || "",
          avatar_url: c.author?.avatarUrl || "",
        },
      }));

    // Extract review comments (non-bot) and flatten threads
    const reviewComments: any[] = [];
    for (const thread of pr.reviewThreads?.nodes || []) {
      const isResolved = thread.isResolved || false;
      for (const c of thread.comments?.nodes || []) {
        if (isBot(c.author?.login || "")) continue;
        reviewComments.push({
          id: c.databaseId,
          html_url: c.url,
          body: c.body || "",
          created_at: c.createdAt,
          updated_at: c.updatedAt,
          user: {
            login: c.author?.login || "",
            avatar_url: c.author?.avatarUrl || "",
          },
          path: c.path || "",
          line: c.line || null,
          is_resolved: isResolved,
        });
      }
    }

    // Sort conversation comments chronologically (oldest first)
    conversationComments.sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    // Sort review comments: unresolved first (chronological), then resolved (chronological)
    reviewComments.sort((a: any, b: any) => {
      if (a.is_resolved !== b.is_resolved) {
        return a.is_resolved ? 1 : -1;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    res.json({
      conversation: conversationComments,
      review: reviewComments,
    });
  } catch (err: any) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || err.message || "Failed to fetch comments";
    res.status(status).json({ error: message });
  }
});

export default router;
