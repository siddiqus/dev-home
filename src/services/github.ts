import { GitHubPR, GitHubComment, GitHubReviewRequest, PRComments, PRThreadStatus } from "../types";
import { SETTINGS_EVENT } from "./config";
import {
  approvePr,
  enqueuePr,
  getGithubMentions,
  getMergeOptions,
  getMergedPrs,
  getOrgMembers,
  getOrgPrs,
  getOrgRepos,
  getOrgTeams,
  getPrBody,
  getPrComments,
  getPrDetail,
  getPrs,
  getReviews,
  mergePr,
  requestReviewers,
  setReviewThreadResolved,
  type MergeMethod,
  type MergeOptions,
} from "../api/github";
import { hasSignedAttachments, SIGNED_URL_TTL_MS } from "../api/github/attachments";
import { withThreadStatus } from "../api/github/prComments";

// Hooks patch comments the same way the cache does.
export { withThreadStatus };

/**
 * Short-lived promise cache for list lookups that several views repeat on mount
 * (views remount on every tab switch). Failures are evicted so they're retried;
 * `force` bypasses the cache for explicit refreshes. Cleared on settings change.
 */
const listCache = new Map<string, { at: number; value: Promise<any> }>();

/**
 * My merged PRs, loaded under a refreshKey (see fetchMyMergedPRs). Kept apart
 * from listCache because it has no TTL: only a refreshKey bump or a polling
 * `force` retires it.
 */
let myMerged: { refreshKey: number; value: Promise<GitHubPR[]> } | null = null;

if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, () => {
    listCache.clear();
    myMerged = null;
  });
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
  myMerged = null;
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

/** How far back my merged PRs are fetched: one list serves Workday's views. */
export const MY_MERGED_DAYS = 60;
/** GitHub's per-search maximum. */
const MY_MERGED_MAX = 100;

/**
 * My PRs merged in the last MY_MERGED_DAYS: Workday's PRs under tickets,
 * Merged recently and Standup all read this one list and filter it by date
 * (mergedSince). Whichever asks first under a refreshKey fetches it for the
 * others; it's kept until refreshKey moves on, or a `force` (polling) refetch.
 */
export function fetchMyMergedPRs(
  refreshKey: number,
  now: Date = new Date(),
  opts: { force?: boolean } = {},
): Promise<GitHubPR[]> {
  const hit = myMerged;
  if (hit && hit.refreshKey === refreshKey && !opts.force) return hit.value;
  const since = new Date(now.getTime() - MY_MERGED_DAYS * 24 * 60 * 60 * 1000);
  const value = getMergedPrs({ scope: "user", since, first: MY_MERGED_MAX }).then(
    (data) => data.prs as GitHubPR[],
  );
  const entry = { refreshKey, value };
  myMerged = entry;
  // A failure isn't kept, so the next caller retries.
  value.catch(() => {
    if (myMerged === entry) myMerged = null;
  });
  return value;
}

/** The PRs in `prs` merged at or after `since`. */
export function mergedSince(prs: GitHubPR[], since: Date): GitHubPR[] {
  const from = since.getTime();
  return prs.filter((pr) => !!pr.merged_at && new Date(pr.merged_at).getTime() >= from);
}

export interface OrgMember {
  login: string;
  /** Public profile name; null when the member hasn't set one. */
  name: string | null;
  avatar_url: string;
}

/** Org members with names, shared by Org PRs, Request review and team member search (paged, so cached). */
export async function fetchOrgMembers(opts: { force?: boolean } = {}): Promise<OrgMember[]> {
  return cached("org-members", ORG_LIST_TTL_MS, !!opts.force, async () => {
    const data = await getOrgMembers();
    return data.members;
  });
}

export interface OrgTeam {
  slug: string;
  name: string;
  /** Members' logins, child teams' included. */
  members: string[];
}

/** Org teams with their members, shared by Request review and All PRs (paged, so cached like members). */
export async function fetchOrgTeams(opts: { force?: boolean } = {}): Promise<OrgTeam[]> {
  return cached("org-teams", ORG_LIST_TTL_MS, !!opts.force, async () => {
    const data = await getOrgTeams();
    return data.teams;
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

/**
 * Session cache for what a PR modal loads lazily, keyed per PR update (an edited
 * PR refetches with a newer updated_at, so it loads afresh). Failures are evicted
 * so the next open retries. Values holding signed image URLs (pasted
 * screenshots) are reused only for SIGNED_URL_TTL_MS, since the URLs expire.
 */
function prModalCache<T>(hasSignedImages: (value: T) => boolean) {
  const entries = new Map<string, { pending: Promise<T>; staleAt: number }>();
  if (typeof window !== "undefined") {
    window.addEventListener(SETTINGS_EVENT, () => entries.clear());
  }
  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      const hit = entries.get(key);
      if (hit && Date.now() < hit.staleAt) return hit.pending;
      const startedAt = Date.now();
      const entry = { pending: load(), staleAt: Infinity };
      entry.pending.then(
        (value) => {
          if (hasSignedImages(value)) entry.staleAt = startedAt + SIGNED_URL_TTL_MS;
        },
        () => {
          if (entries.get(key) === entry) entries.delete(key);
        },
      );
      entries.set(key, entry);
      return entry.pending;
    },
    /**
     * Reload a value whose signed image URLs may have expired (an image failed
     * to load); null while they're still good, or when it has none.
     */
    refresh(key: string, load: () => Promise<T>): Promise<T> | null {
      const hit = entries.get(key);
      if (hit && Date.now() < hit.staleAt) return null;
      return this.get(key, load);
    },
    /** Rewrite a cached value in place, keeping its expiry. */
    patch(key: string, update: (value: T) => T): void {
      const entry = entries.get(key);
      if (entry) entry.pending = entry.pending.then(update);
    },
  };
}

const prModalKey = (pr: GitHubPR) => `${pr.repo_full_name}#${pr.number}@${pr.updated_at}`;

const prBodyCache = prModalCache<string>(hasSignedAttachments);

const loadPRBody = (pr: GitHubPR) => () => {
  const [owner, repo] = pr.repo_full_name.split("/");
  return getPrBody({ owner, repo, number: pr.number });
};

/** Lazily fetch (and cache) a PR's markdown description. */
export function fetchPRBody(pr: GitHubPR): Promise<string> {
  return prBodyCache.get(prModalKey(pr), loadPRBody(pr));
}

/**
 * A fresh description for when one of its images failed to load, in case its
 * signed URLs expired; null when they can't have (nothing to refetch). A body
 * that came with the PR isn't cached, so the first call fetches one.
 */
export function refreshPRBodyImages(pr: GitHubPR): Promise<string> | null {
  return prBodyCache.refresh(prModalKey(pr), loadPRBody(pr));
}

const prCommentsCache = prModalCache<PRComments>(
  (c) =>
    c.conversation.some((item) => hasSignedAttachments(item.body)) ||
    c.threads.some((t) => t.comments.some((m) => hasSignedAttachments(m.body))),
);

const loadPRComments = (pr: GitHubPR) => () => {
  const [owner, repo] = pr.repo_full_name.split("/");
  return getPrComments({ owner, repo, number: pr.number });
};

/** Lazily fetch (and cache) a PR's review threads and conversation. */
export function fetchPRComments(pr: GitHubPR): Promise<PRComments> {
  return prCommentsCache.get(prModalKey(pr), loadPRComments(pr));
}

/** Like refreshPRBodyImages, for the comments. */
export function refreshPRCommentImages(pr: GitHubPR): Promise<PRComments> | null {
  return prCommentsCache.refresh(prModalKey(pr), loadPRComments(pr));
}

/**
 * Resolve or unresolve one of a PR's review threads, then patch the cached
 * comments: resolving needn't bump the PR's updated_at, so a reopened modal
 * would otherwise show the old state.
 */
export async function setPRThreadResolved(
  pr: GitHubPR,
  threadId: string,
  resolved: boolean,
): Promise<PRThreadStatus> {
  const status = await setReviewThreadResolved({ threadId, resolved });
  prCommentsCache.patch(prModalKey(pr), (c) => withThreadStatus(c, threadId, status));
  return status;
}

// Merge options per PR for the session: a repo's merge methods and queue rarely
// change. Failures are evicted so the next click retries.
const mergeOptionsCache = new Map<string, Promise<MergeOptions>>();
if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, () => mergeOptionsCache.clear());
}

/** Lazily fetch (and cache) what the Merge button needs for a PR. */
export function fetchMergeOptions(pr: GitHubPR): Promise<MergeOptions> {
  let pending = mergeOptionsCache.get(pr.html_url);
  if (!pending) {
    const [owner, repo] = pr.repo_full_name.split("/");
    pending = getMergeOptions({ owner, repo, number: pr.number });
    pending.catch(() => mergeOptionsCache.delete(pr.html_url));
    mergeOptionsCache.set(pr.html_url, pending);
  }
  return pending;
}

/**
 * Merge a PR with `method`, or add it to its merge queue (which picks the
 * method). Pinned to the head commit the list loaded, so GitHub refuses if
 * commits landed since.
 */
export async function mergePR(
  pr: GitHubPR,
  options: MergeOptions,
  method: MergeMethod,
): Promise<void> {
  const args = { pullRequestId: options.pullRequestId, expectedHeadOid: pr.head.sha };
  if (options.queue) await enqueuePr(args);
  else await mergePr({ ...args, method });
}

/** Approve a PR, pinned to the head the list loaded (GitHub's latest when it didn't load one). */
export async function approvePR(pr: GitHubPR): Promise<void> {
  const [owner, repo] = pr.repo_full_name.split("/");
  await approvePr({ owner, repo, number: pr.number, commitId: pr.head.sha });
}

/** Request (or re-request) reviews on a PR from people (logins) and teams (slugs). */
export async function requestPRReviewers(
  pr: GitHubPR,
  reviewers: { users: string[]; teams: string[] },
): Promise<void> {
  const [owner, repo] = pr.repo_full_name.split("/");
  await requestReviewers({
    owner,
    repo,
    number: pr.number,
    reviewers: reviewers.users,
    teamReviewers: reviewers.teams,
  });
}
