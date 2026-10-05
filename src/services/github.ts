import { GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import {
  getGithubMentions,
  getMergedPrs,
  getOrgMembers,
  getOrgPrs,
  getOrgRepos,
  getPrDetail,
  getPrs,
  getReviews,
} from "../api/github";

export async function fetchOpenPRs(
  signal?: AbortSignal,
): Promise<{ prs: GitHubPR[]; prComments: GitHubComment[] }> {
  const data = await getPrs(signal);
  return { prs: data.prs, prComments: data.pr_comments || [] };
}

export interface ReviewPRs {
  /** Open PRs where the user's review is currently requested. */
  reviews: GitHubReviewRequest[];
  /** Open PRs (not the user's) the user has already reviewed or commented on. */
  reviewing: GitHubPR[];
}

export async function fetchReviewRequests(signal?: AbortSignal): Promise<ReviewPRs> {
  const data = await getReviews(signal);
  return { reviews: data.reviews, reviewing: data.reviewing ?? [] };
}

export async function fetchMentions(signal?: AbortSignal): Promise<GitHubComment[]> {
  const data = await getGithubMentions(signal);
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
  const params: { cursor?: string; authors?: string[]; repos?: string[] } = {};
  if (cursor) params.cursor = cursor;
  if (author) params.authors = [author];
  if (repo) params.repos = [repo];
  const data = await getOrgPrs(params);
  return data;
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
 * One search covers every combination (GitHub ORs repeated qualifiers).
 */
export async function fetchOrgPRsMulti(authors: string[], repos: string[]): Promise<GitHubPR[]> {
  const data = await getOrgPrs({ authors, repos });
  return dedupeAndSort(data.prs);
}

/** Recently merged PRs (last 3 days); one search for any number of authors/repos. */
export async function fetchRecentlyMergedPRs(
  scope: "user" | "org",
  authors?: string[],
  repos?: string[],
): Promise<GitHubPR[]> {
  const data = await getMergedPrs({ scope, authors, repos });
  const multi = scope === "org" && ((authors?.length ?? 0) > 1 || (repos?.length ?? 0) > 1);
  // Multi-filter results have always been returned newest-updated first.
  return multi ? dedupeAndSort(data.prs) : data.prs;
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
