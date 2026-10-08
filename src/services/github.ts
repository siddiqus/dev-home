import { GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import { SETTINGS_EVENT } from "./config";
import {
  getGithubMentions,
  getMergedPrs,
  getOrgMembers,
  getOrgPrs,
  getOrgRepos,
  getPrBody,
  getPrDetail,
  getPrs,
  getReviews,
} from "../api/github";

/**
 * Short-lived promise cache for list lookups that several views repeat on mount
 * (views remount on every tab switch). Failures are evicted so they're retried;
 * `force` bypasses the cache for explicit refreshes. Cleared on settings change.
 */
const listCache = new Map<string, { at: number; value: Promise<any> }>();

if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, () => listCache.clear());
}

function cached<T>(key: string, ttlMs: number, force: boolean, load: () => Promise<T>): Promise<T> {
  const hit = listCache.get(key);
  if (!force && hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = load();
  listCache.set(key, { at: Date.now(), value });
  value.catch(() => {
    if (listCache.get(key)?.value === value) listCache.delete(key);
  });
  return value;
}

/** Test helper: forget every cached list lookup. */
export function clearListCache(): void {
  listCache.clear();
}

const MERGED_TTL_MS = 5 * 60 * 1000;
const ORG_LIST_TTL_MS = 30 * 60 * 1000;

export async function fetchOpenPRs(signal?: AbortSignal): Promise<GitHubPR[]> {
  const data = await getPrs(signal);
  return data.prs;
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

/**
 * Fetch org PRs for multiple authors and/or repos using AND semantics:
 * a PR is included if it matches ANY selected author AND is in ANY selected repo.
 * One search covers every combination (GitHub ORs repeated qualifiers), sorted
 * newest-updated first by the query itself.
 */
export async function fetchOrgPRsMulti(authors: string[], repos: string[]): Promise<GitHubPR[]> {
  const data = await getOrgPrs({ authors, repos });
  return data.prs;
}

/**
 * Recently merged PRs (last 3 days); one search for any number of authors/repos.
 * Cached briefly per filter so remounting a view doesn't re-search.
 */
export async function fetchRecentlyMergedPRs(
  scope: "user" | "org",
  authors?: string[],
  repos?: string[],
  opts: { force?: boolean } = {},
): Promise<GitHubPR[]> {
  const key = `merged:${JSON.stringify([scope, [...(authors ?? [])].sort(), [...(repos ?? [])].sort()])}`;
  return cached(key, MERGED_TTL_MS, !!opts.force, async () => {
    const data = await getMergedPrs({ scope, authors, repos });
    return data.prs;
  });
}

export interface OrgMember {
  login: string;
  avatar_url: string;
}

/** Org members, shared by Org PRs and team member search (paged REST, so cached). */
export async function fetchOrgMembers(opts: { force?: boolean } = {}): Promise<OrgMember[]> {
  return cached("org-members", ORG_LIST_TTL_MS, !!opts.force, async () => {
    const data = await getOrgMembers();
    return data.members;
  });
}

export interface OrgRepo {
  full_name: string;
  name: string;
}

export async function fetchOrgRepos(opts: { force?: boolean } = {}): Promise<OrgRepo[]> {
  return cached("org-repos", ORG_LIST_TTL_MS, !!opts.force, async () => {
    const data = await getOrgRepos();
    return data.repos;
  });
}

/** Fetch a single PR (body + checks) by repo and number. */
export async function fetchPR(owner: string, repo: string, number: number): Promise<GitHubPR> {
  const data = await getPrDetail({ owner, repo, number });
  return data.pr;
}

// PR descriptions shared across every modal for the session. Keyed by updated_at
// too, so an edited PR (which refetches with a newer timestamp) loads afresh.
// Failures are evicted so the next open retries.
const prBodyCache = new Map<string, Promise<string>>();
if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, () => prBodyCache.clear());
}

/** Lazily fetch (and cache) a PR's markdown description. */
export function fetchPRBody(pr: GitHubPR): Promise<string> {
  const key = `${pr.repo_full_name}#${pr.number}@${pr.updated_at}`;
  let pending = prBodyCache.get(key);
  if (!pending) {
    const [owner, repo] = pr.repo_full_name.split("/");
    pending = getPrBody({ owner, repo, number: pr.number });
    pending.catch(() => prBodyCache.delete(key));
    prBodyCache.set(key, pending);
  }
  return pending;
}
