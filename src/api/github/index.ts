import { requireSettings } from "../http/credentials";
import { ApiError, toApiError } from "../http/errors";
import { githubGraphql, githubRest } from "../http/github";
import { extractOwnPRComments, hoursAgo, isBot, mapGraphQLPr, monthsAgo } from "./mapping";
import {
  fetchAllNotifications,
  fetchCommentsInBatches,
  filterOpenNotifications,
} from "./notifications";
import {
  PR_CHECKS_ROLLUP,
  SEARCH_MERGED_PRS_QUERY,
  SEARCH_MY_PRS_QUERY,
  SEARCH_ORG_PRS_QUERY,
  SEARCH_PRS_QUERY,
  SINGLE_PR_QUERY,
} from "./queries";
import { getRequiredContexts, mapOpenPrsWithChecks } from "./requiredContexts";

export { clearRequiredContextsCache } from "./requiredContexts";

/**
 * Formerly GET /api/github/prs.
 * Fetch open pull requests authored by the configured user.
 * Uses the extended query to include review/approval status and comments.
 * Also returns pr_comments: comments on the user's PRs by other people (non-bot),
 * so the frontend can merge them into mentions without a second GraphQL call.
 */
export async function getPrs(): Promise<{ prs: any[]; pr_comments: any[] }> {
  const config = requireSettings();
  const q = `author:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  const result = await githubGraphql<{ search: { nodes: any[] } }>(SEARCH_MY_PRS_QUERY, {
    query: q,
    first: 50,
  });

  const nodes = result.search.nodes || [];
  const prs = (await mapOpenPrsWithChecks(nodes, config.githubUsername)).filter(
    (pr: any) => pr.state === "open",
  );
  const prComments = extractOwnPRComments(nodes, config.githubUsername);

  return { prs, pr_comments: prComments };
}

/** Key a PR search node by repo + number, for cross-search set membership. */
function prNodeKey(n: any): string {
  return `${n.repository?.nameWithOwner || ""}#${n.number}`;
}

/**
 * Formerly GET /api/github/reviews.
 * Fetch open PRs on the configured user's review plate, as two lists:
 *  - `reviews`: PRs where the user's review is currently requested. Each carries
 *    `viewer_engaged` (the user has already reviewed or commented), so the
 *    Reviews tab can show only untouched requests while Summary/Focus/Board keep
 *    every pending request, re-requests included.
 *  - `reviewing`: open PRs (not authored by the user) that the user has reviewed
 *    or commented on — i.e. reviews in progress. GitHub drops you from
 *    `review-requested:` once you submit a review, so this needs its own search.
 */
export async function getReviews(): Promise<{ reviews: any[]; reviewing: any[] }> {
  const config = requireSettings();
  const user = config.githubUsername;
  const base = `type:pr state:open updated:>=${monthsAgo()}`;
  const search = (q: string) =>
    githubGraphql<{ search: { nodes: any[] } }>(SEARCH_PRS_QUERY, { query: q, first: 50 }).then(
      (r) => (r.search.nodes || []).filter((n: any) => n && n.number),
    );

  const [requested, reviewedBy, commented] = await Promise.all([
    search(`review-requested:${user} ${base}`),
    search(`reviewed-by:${user} -author:${user} ${base}`),
    search(`commenter:${user} -author:${user} ${base}`),
  ]);

  const engagedNodes = new Map<string, any>();
  for (const n of [...reviewedBy, ...commented]) {
    if (!engagedNodes.has(prNodeKey(n))) engagedNodes.set(prNodeKey(n), n);
  }

  const [reviews, reviewing] = await Promise.all([
    mapOpenPrsWithChecks(requested),
    mapOpenPrsWithChecks([...engagedNodes.values()]),
  ]);

  return {
    reviews: reviews
      .filter((pr: any) => pr.state === "open")
      .map((pr: any) => ({
        ...pr,
        viewer_engaged: engagedNodes.has(`${pr.repo_full_name}#${pr.number}`),
      })),
    reviewing: reviewing.filter((pr: any) => pr.state === "open"),
  };
}

/**
 * Formerly GET /api/github/org-prs.
 * Fetch open, non-draft PRs for the configured org, sorted by most recent.
 * Supports cursor-based pagination via `cursor` and optional `author` and `repo` filters.
 */
export async function getOrgPrs(
  args: { cursor?: string; author?: string; repo?: string } = {},
): Promise<{ prs: any[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }> {
  const config = requireSettings();
  const org = config.githubOrg;

  if (!org) {
    return { prs: [], pageInfo: { hasNextPage: false, endCursor: null } };
  }

  const author = typeof args.author === "string" ? args.author.trim() : "";
  const repo = typeof args.repo === "string" ? args.repo.trim() : "";
  const cursor = typeof args.cursor === "string" ? args.cursor : undefined;

  // repo: and org: are mutually exclusive in GitHub search;
  // when a specific repo is selected, scope to that repo instead of the whole org.
  let q = repo
    ? `repo:${repo} type:pr state:open draft:false sort:updated-desc`
    : `org:${org} type:pr state:open draft:false sort:updated-desc`;
  if (author) {
    q += ` author:${author}`;
  }

  const result = await githubGraphql<{
    search: { nodes: any[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  }>(SEARCH_ORG_PRS_QUERY, {
    query: q,
    first: 10,
    after: cursor || null,
  });

  const nodes = result.search.nodes || [];
  const prs = (await mapOpenPrsWithChecks(nodes)).filter(
    (pr: any) => pr.state === "open" && !pr.draft,
  );

  return { prs, pageInfo: result.search.pageInfo };
}

/**
 * Formerly GET /api/github/org-prs-multi-repo.
 * Fetch open, non-draft PRs across multiple repos using aliased repository() GraphQL queries.
 * Accepts `repos` as "owner/repo1,owner/repo2" and an optional single `author` login.
 */
export async function getOrgPrsMultiRepo(args: {
  repos: string;
  author?: string;
}): Promise<{ prs: any[] }> {
  const repoParam = typeof args.repos === "string" ? args.repos.trim() : "";
  const author = typeof args.author === "string" ? args.author.trim() : "";

  const repoList = repoParam
    ? repoParam
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
    : [];
  if (repoList.length === 0) {
    return { prs: [] };
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
      additions
      deletions
      changedFiles
      repository { nameWithOwner }
      labels(first: 10) { nodes { name color } }
      mergeQueueEntry { id }
      mergeStateStatus
      reviewDecision
      commits(last: 1) {
        nodes {
          commit {
            ${PR_CHECKS_ROLLUP}
          }
        }
      }
      reviews(last: 20) {
        nodes {
          state
          author { login }
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

  const result = await githubGraphql<Record<string, any>>(query);

  // Collect all PRs from all repos
  const allPrs: any[] = [];
  for (const key of Object.keys(result)) {
    const nodes = result[key]?.pullRequests?.nodes || [];
    allPrs.push(...nodes);
  }

  let prs = (await mapOpenPrsWithChecks(allPrs)).filter(
    (pr: any) => pr.state === "open" && !pr.draft,
  );

  // Filter by author if specified
  if (author) {
    const authorLower = author.toLowerCase();
    prs = prs.filter((pr: any) => pr.user.login.toLowerCase() === authorLower);
  }

  // Sort by updated_at descending
  prs.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return { prs };
}

/**
 * Formerly GET /api/github/org-members.
 * Fetch members of the configured org for the author filter dropdown.
 */
export async function getOrgMembers(): Promise<{
  members: { login: string; avatar_url: string }[];
}> {
  const config = requireSettings();
  const org = config.githubOrg;

  if (!org) {
    return { members: [] };
  }

  const github = githubRest();
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
  return { members };
}

/**
 * Formerly GET /api/github/org-repos.
 * Fetch the 40 most recently pushed repositories in the configured org.
 */
export async function getOrgRepos(): Promise<{ repos: { full_name: string; name: string }[] }> {
  const config = requireSettings();
  const org = config.githubOrg;

  if (!org) {
    return { repos: [] };
  }

  const github = githubRest();
  const { data } = await github.get(`/orgs/${org}/repos`, {
    params: { per_page: 40, page: 1, sort: "pushed", direction: "desc" },
  });

  const repos = data.map((r: any) => ({ full_name: r.full_name, name: r.name }));
  return { repos };
}

/**
 * Formerly GET /api/github/mentions.
 * Fetch GitHub mentions from the notifications API (participating, all, 2-month window).
 * Note: comments on the user's own PRs are returned by getPrs() as pr_comments
 * and merged on the frontend, avoiding a duplicate GraphQL call.
 */
export async function getGithubMentions(): Promise<{ mentions: any[] }> {
  const github = githubRest();
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

  return { mentions: deduplicated };
}

/**
 * Formerly GET /api/github/merged-prs.
 * Fetch recently merged PRs (last 3 days).
 * scope "user" (default) — user's own merged PRs
 * scope "org" — org-wide merged PRs
 * Optional: author (login), repo (owner/repo)
 */
export async function getMergedPrs(
  args: { scope?: "user" | "org"; author?: string; repo?: string } = {},
): Promise<{ prs: any[] }> {
  const config = requireSettings();
  const scope = typeof args.scope === "string" ? args.scope : "user";
  const author = typeof args.author === "string" ? args.author.trim() : "";
  const repo = typeof args.repo === "string" ? args.repo.trim() : "";
  const since = hoursAgo(24 * 3); // last 3 days

  let q: string;

  if (scope === "org") {
    const org = config.githubOrg;
    if (!org) {
      return { prs: [] };
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

  const result = await githubGraphql<{ search: { nodes: any[] } }>(SEARCH_MERGED_PRS_QUERY, {
    query: q,
    first: 20,
  });

  const prs = (result.search.nodes || []).map((n: any) => mapGraphQLPr(n));
  return { prs };
}

/**
 * Formerly GET /api/github/pr/:owner/:repo/:number.
 * Fetch a single PR with its body and checks, shaped like the list endpoints.
 * Used by views (e.g. the team dashboard) that only hold a PR reference and need
 * the full record to populate the description modal on demand.
 */
export async function getPrDetail(args: {
  owner: string;
  repo: string;
  number: number;
}): Promise<{ pr: any }> {
  const { owner, repo } = args;
  const number = parseInt(String(args.number), 10);

  if (!owner || !repo || isNaN(number)) {
    throw new ApiError(400, "owner, repo, and number are required");
  }

  try {
    const result = await githubGraphql<{ repository: { pullRequest: any } }>(SINGLE_PR_QUERY, {
      owner,
      repo,
      number,
    });
    const node = result.repository?.pullRequest;
    if (!node) {
      throw new ApiError(404, "Pull request not found");
    }
    const required = await getRequiredContexts(owner, repo, node.baseRefName || "");
    return { pr: mapGraphQLPr(node, undefined, required) };
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    // GitHub reports a missing repo/PR as a GraphQL NOT_FOUND error, not a null node.
    if (err?.graphqlErrors?.some((e: any) => e?.type === "NOT_FOUND")) {
      throw new ApiError(404, "Pull request not found");
    }
    // githubGraphql already maps HTTP/network failures to ApiError (rethrown above),
    // so what's left is a GraphQL error with no HTTP status — a 500 on the old server.
    throw new ApiError(500, toApiError(err).message || "Failed to fetch pull request");
  }
}
