import { GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import {
  getGithubMentions,
  getMergedPrs,
  getOrgMembers,
  getOrgPrs,
  getOrgPrsMultiRepo,
  getOrgRepos,
  getPrDetail,
  getPrs,
  getReviews,
} from "../api/github";

export async function fetchOpenPRs(): Promise<{ prs: GitHubPR[]; prComments: GitHubComment[] }> {
  const data = await getPrs();
  return { prs: data.prs, prComments: data.pr_comments || [] };
}

export interface ReviewPRs {
  /** Open PRs where the user's review is currently requested. */
  reviews: GitHubReviewRequest[];
  /** Open PRs (not the user's) the user has already reviewed or commented on. */
  reviewing: GitHubPR[];
}

export async function fetchReviewRequests(): Promise<ReviewPRs> {
  const data = await getReviews();
  return { reviews: data.reviews, reviewing: data.reviewing ?? [] };
}

export async function fetchMentions(): Promise<GitHubComment[]> {
  const data = await getGithubMentions();
  return data.mentions;
}

export interface OrgPRsPage {
  prs: GitHubPR[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export async function fetchOrgPRs(
  cursor?: string,
  author?: string,
  repo?: string,
): Promise<OrgPRsPage> {
  const params: { cursor?: string; author?: string; repo?: string } = {};
  if (cursor) params.cursor = cursor;
  if (author) params.author = author;
  if (repo) params.repo = repo;
  const data = await getOrgPrs(params);
  return data;
}

/**
 * Fetch PRs across multiple repos in a single GraphQL query using aliased repository() calls.
 * Optionally filter by a single author on the backend.
 */
async function fetchOrgPRsMultiRepo(repos: string[], author?: string): Promise<GitHubPR[]> {
  const params: { repos: string; author?: string } = { repos: repos.join(",") };
  if (author) params.author = author;
  const data = await getOrgPrsMultiRepo(params);
  return data.prs;
}

function dedupeAndSort(prs: GitHubPR[]): GitHubPR[] {
  const seen = new Set<number>();
  const unique: GitHubPR[] = [];
  for (const pr of prs) {
    if (!seen.has(pr.id)) {
      seen.add(pr.id);
      unique.push(pr);
    }
  }
  unique.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return unique;
}

/**
 * Fetch org PRs for multiple authors and/or repos using AND semantics:
 * a PR is included if it matches ANY selected author AND is in ANY selected repo.
 * Fans out per-author calls, each scoped to the selected repos.
 */
export async function fetchOrgPRsMulti(authors: string[], repos: string[]): Promise<GitHubPR[]> {
  const hasMultiRepos = repos.length > 1;
  const authorCombos = authors.length > 0 ? authors : [""];

  const calls: Promise<GitHubPR[]>[] = [];
  for (const author of authorCombos) {
    if (hasMultiRepos) {
      calls.push(fetchOrgPRsMultiRepo(repos, author || undefined));
    } else {
      calls.push(
        fetchOrgPRs(undefined, author || undefined, repos[0] || undefined).then((r) => r.prs),
      );
    }
  }

  const results = await Promise.all(calls);
  return dedupeAndSort(results.flat());
}

export async function fetchRecentlyMergedPRs(
  scope: "user" | "org",
  authors?: string[],
  repos?: string[],
): Promise<GitHubPR[]> {
  if (scope === "org" && ((authors && authors.length > 1) || (repos && repos.length > 1))) {
    const authorCombos = authors && authors.length > 0 ? authors : [""];
    const repoCombos = repos && repos.length > 0 ? repos : [""];
    const calls: Promise<GitHubPR[]>[] = [];
    for (const author of authorCombos) {
      for (const repo of repoCombos) {
        const params: { scope: "user" | "org"; author?: string; repo?: string } = {
          scope: "org",
        };
        if (author) params.author = author;
        if (repo) params.repo = repo;
        calls.push(getMergedPrs(params).then((r) => r.prs));
      }
    }
    const results = await Promise.all(calls);
    return dedupeAndSort(results.flat());
  }

  const params: { scope: "user" | "org"; author?: string; repo?: string } = { scope };
  if (authors && authors[0]) params.author = authors[0];
  if (repos && repos[0]) params.repo = repos[0];
  const data = await getMergedPrs(params);
  return data.prs;
}

export interface OrgMember {
  login: string;
  avatar_url: string;
}

export async function fetchOrgMembers(): Promise<OrgMember[]> {
  const data = await getOrgMembers();
  return data.members;
}

export interface OrgRepo {
  full_name: string;
  name: string;
}

export async function fetchOrgRepos(): Promise<OrgRepo[]> {
  const data = await getOrgRepos();
  return data.repos;
}

/** Fetch a single PR (body + checks) by repo and number. */
export async function fetchPR(owner: string, repo: string, number: number): Promise<GitHubPR> {
  const data = await getPrDetail({ owner, repo, number });
  return data.pr;
}
