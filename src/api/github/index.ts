import { requireSettings } from "../http/credentials";
import { ApiError, toApiError } from "../http/errors";
import { githubGraphql, githubRest } from "../http/github";
import { extractOwnPRComments, hoursAgo, isBot, mapGraphQLPr, monthsAgo } from "./mapping";
import {
  MAX_MENTION_THREADS,
  fetchAllNotifications,
  fetchCommentsInBatches,
  filterOpenNotifications,
} from "./notifications";
import {
  REVIEWS_QUERY,
  SEARCH_MERGED_PRS_QUERY,
  SEARCH_MY_PRS_QUERY,
  SEARCH_ORG_PRS_QUERY,
  SINGLE_PR_QUERY,
} from "./queries";
import { getRequiredContexts, mapOpenPrsWithChecks } from "./requiredContexts";

export { clearRequiredContextsCache } from "./requiredContexts";
export { resetMentionsCache } from "./notifications";

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

  const result = await githubGraphql<
    Record<"requested" | "reviewedBy" | "commented", { nodes: any[] }>
  >(REVIEWS_QUERY, {
    requestedQuery: `review-requested:${user} ${base}`,
    reviewedQuery: `reviewed-by:${user} -author:${user} ${base}`,
    commentedQuery: `commenter:${user} -author:${user} ${base}`,
    first: 50,
  });
  const prNodes = (key: "requested" | "reviewedBy" | "commented") =>
    (result[key]?.nodes || []).filter((n: any) => n && n.number);
  const requested = prNodes("requested");
  const reviewedBy = prNodes("reviewedBy");
  const commented = prNodes("commented");

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

/** Trimmed, non-empty entries of an optional string list. */
function cleanList(list: string[] | undefined): string[] {
  return (Array.isArray(list) ? list : []).map((s) => s.trim()).filter(Boolean);
}

/**
 * Repo scope for a search: `repo:` per selected repo, else the whole org.
 * GitHub search ORs repeated qualifiers of the same kind, so one query covers
 * every selected repo (and, with `author:` qualifiers, every selected author).
 */
function scopeQualifiers(org: string, repos: string[]): string {
  return repos.length > 0 ? repos.map((r) => `repo:${r}`).join(" ") : `org:${org}`;
}

function authorQualifiers(authors: string[]): string {
  return authors.map((a) => ` author:${a}`).join("");
}

/** Search query for open, non-draft org PRs by any of `authors` in any of `repos`. */
export function buildOrgPrsQuery(args: {
  org: string;
  authors: string[];
  repos: string[];
}): string {
  return (
    `${scopeQualifiers(args.org, cleanList(args.repos))} type:pr state:open draft:false sort:updated-desc` +
    authorQualifiers(cleanList(args.authors))
  );
}

/**
 * Formerly GET /api/github/org-prs (and org-prs-multi-repo).
 * Fetch open, non-draft PRs for the configured org, sorted by most recent.
 * Supports cursor-based pagination via `cursor` and optional `authors` and `repos`
 * filters (a PR matches if it's by any selected author in any selected repo).
 */
export async function getOrgPrs(
  args: { cursor?: string; authors?: string[]; repos?: string[] } = {},
): Promise<{ prs: any[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }> {
  const config = requireSettings();
  const org = config.githubOrg;

  if (!org) {
    return { prs: [], pageInfo: { hasNextPage: false, endCursor: null } };
  }

  const authors = cleanList(args.authors);
  const repos = cleanList(args.repos);
  const cursor = typeof args.cursor === "string" ? args.cursor : undefined;
  const q = buildOrgPrsQuery({ org, authors, repos });
  // Pages of 10 for single-filter browsing; a multi-filter query replaces a
  // fan-out of calls and isn't paginated, so it takes the GraphQL max of 100.
  const first = authors.length > 1 || repos.length > 1 ? 100 : 10;

  const result = await githubGraphql<{
    search: { nodes: any[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  }>(SEARCH_ORG_PRS_QUERY, {
    query: q,
    first,
    after: cursor || null,
  });

  const nodes = result.search.nodes || [];
  const prs = (await mapOpenPrsWithChecks(nodes)).filter(
    (pr: any) => pr.state === "open" && !pr.draft,
  );

  return { prs, pageInfo: result.search.pageInfo };
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
 * Only the newest MAX_MENTION_THREADS threads are processed (closed ones are then
 * dropped); the notification list, subject states and per-thread comments are
 * cached between calls (see ./notifications).
 * Note: comments on the user's own PRs are returned by getPrs() as pr_comments
 * and merged on the frontend, avoiding a duplicate GraphQL call.
 */
export async function getGithubMentions(): Promise<{ mentions: any[] }> {
  const github = githubRest();
  const since = `${monthsAgo(2)}T00:00:00Z`;

  const allNotifications = await fetchAllNotifications(github, since);
  // Cap before the open-state check so at most MAX_MENTION_THREADS subjects are looked up.
  const newest = [...allNotifications]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, MAX_MENTION_THREADS);
  const notifications = await filterOpenNotifications(newest, github);
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
 * Search query for recently merged PRs, or null when org scope has no org.
 * scope "user" — the user's own merged PRs.
 * scope "org" — merged PRs in the selected repos (or the whole org), optionally
 * limited to any of the selected authors.
 */
export function buildMergedPrsQuery(args: {
  scope: "user" | "org";
  username: string;
  org: string;
  authors: string[];
  repos: string[];
  since: string;
}): string | null {
  const base = `type:pr is:merged merged:>=${args.since}`;
  if (args.scope !== "org") return `author:${args.username} ${base}`;
  if (!args.org) return null;
  return (
    `${base} ${scopeQualifiers(args.org, cleanList(args.repos))}` +
    authorQualifiers(cleanList(args.authors))
  );
}

/**
 * Formerly GET /api/github/merged-prs.
 * Fetch recently merged PRs (last 3 days) in a single search.
 * scope "user" (default) — user's own merged PRs
 * scope "org" — org-wide merged PRs
 * Optional: authors (logins), repos (owner/repo) — any of each
 */
export async function getMergedPrs(
  args: { scope?: "user" | "org"; authors?: string[]; repos?: string[] } = {},
): Promise<{ prs: any[] }> {
  const config = requireSettings();
  const scope = args.scope === "org" ? "org" : "user";
  const authors = cleanList(args.authors);
  const repos = cleanList(args.repos);

  const q = buildMergedPrsQuery({
    scope,
    username: config.githubUsername,
    org: config.githubOrg,
    authors,
    repos,
    since: hoursAgo(24 * 3), // last 3 days
  });
  if (q === null) {
    return { prs: [] };
  }

  const result = await githubGraphql<{ search: { nodes: any[] } }>(SEARCH_MERGED_PRS_QUERY, {
    query: q,
    first: authors.length > 1 || repos.length > 1 ? 50 : 20,
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
