import type { HttpClient } from "../http/client";
import { SETTINGS_EVENT, loadSettings } from "../../services/config";
import { githubGraphql } from "../http/github";
import { buildSubjectStatesQuery } from "./queries";

/**
 * Extract the issue/PR number from a GitHub API subject URL.
 * e.g. "https://api.github.com/repos/owner/repo/pulls/123" -> 123
 */
export function extractSubjectNumber(url: string | undefined): number | null {
  if (!url) return null;
  const match = url.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Convert a GitHub API subject URL to a browser-facing HTML URL.
 * e.g. "https://api.github.com/repos/owner/repo/pulls/123"
 *   -> "https://github.com/owner/repo/pull/123"
 */
export function subjectUrlToHtml(apiUrl: string | undefined, repoFullName: string): string {
  if (!apiUrl) return `https://github.com/${repoFullName}`;
  // /repos/owner/repo/pulls/123 -> /owner/repo/pull/123
  // /repos/owner/repo/issues/456 -> /owner/repo/issues/456
  const match = apiUrl.match(/repos\/(.+)\/(pulls|issues)\/(\d+)$/);
  if (!match) return `https://github.com/${repoFullName}`;
  const [, ownerRepo, type, number] = match;
  const htmlType = type === "pulls" ? "pull" : "issues";
  return `https://github.com/${ownerRepo}/${htmlType}/${number}`;
}

const ALLOWED_REASONS = new Set([
  "approval_requested",
  "assign",
  "mention",
  "review_requested",
  "team_mention",
]);

/** Most mention threads processed per refresh (newest first). */
export const MAX_MENTION_THREADS = 50;

/**
 * Last fetched notification list, revalidated with `If-Modified-Since` so an
 * unchanged inbox costs a 304 (which doesn't count against the rate limit).
 * `since` is part of the key: a different window means a different list.
 */
let notificationsCache: {
  since: string | null;
  lastModified: string | null;
  notifications: any[];
} = { since: null, lastModified: null, notifications: [] };

/** Mapped mention per notification thread, reused while the thread's `updated_at` is unchanged. */
const threadComments = new Map<string, { updatedAt: string; comments: any[] }>();

/**
 * Subject open/closed state per notification thread, reused while the thread's
 * `updated_at` is unchanged (closing or merging a PR updates the notification).
 * "Open" entries also expire after SUBJECT_OPEN_TTL_MS: GitHub doesn't notify
 * the actor, so a PR the user closes themselves leaves `updated_at` untouched.
 */
const subjectStates = new Map<string, { updatedAt: string; open: boolean; checkedAt: number }>();

/** How long a cached "open" subject state is trusted before it's rechecked. */
export const SUBJECT_OPEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * The three caches above, saved so a page load starts warm: the first
 * notifications request is conditional (a free 304 when nothing changed) and
 * threads whose `updated_at` hasn't moved need no calls. Scoped to the GitHub
 * user; read once per page load, written once per mentions refresh.
 */
export const MENTIONS_CACHE_KEY = "dev-home-mentions-cache";

/** The saved copy has been read into memory (or deliberately skipped). */
let hydrated = false;

const cacheOwner = () => loadSettings().githubUsername || "";

/** A notification cut to the fields the mentions code reads, so the saved copy stays small. */
export function trimNotification(n: any): any {
  return {
    id: String(n.id),
    reason: n.reason,
    updated_at: n.updated_at,
    repository: { full_name: n.repository?.full_name ?? "" },
    subject: {
      type: n.subject?.type ?? null,
      title: n.subject?.title ?? "",
      url: n.subject?.url ?? null,
      latest_comment_url: n.subject?.latest_comment_url ?? null,
    },
  };
}

/** Fill the in-memory caches from the saved copy, once per page load. */
export function hydrateMentionsCache(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const saved = JSON.parse(localStorage.getItem(MENTIONS_CACHE_KEY) || "null");
    if (!saved || saved.owner !== cacheOwner()) return;
    const n = saved.notifications;
    if (n && Array.isArray(n.list)) {
      notificationsCache = {
        since: n.since ?? null,
        lastModified: n.lastModified ?? null,
        notifications: n.list,
      };
    }
    for (const [k, v] of Object.entries(saved.subjects ?? {})) subjectStates.set(k, v as any);
    for (const [k, v] of Object.entries(saved.comments ?? {})) threadComments.set(k, v as any);
  } catch {
    // Garbled copy: start cold.
  }
}

/** Write the in-memory caches back; quota errors leave memory as the only copy. */
export function saveMentionsCache(): void {
  try {
    localStorage.setItem(
      MENTIONS_CACHE_KEY,
      JSON.stringify({
        owner: cacheOwner(),
        notifications: {
          since: notificationsCache.since,
          lastModified: notificationsCache.lastModified,
          list: notificationsCache.notifications,
        },
        subjects: Object.fromEntries(subjectStates),
        comments: Object.fromEntries(threadComments),
      }),
    );
  } catch {
    /* quota exceeded */
  }
}

/** Test helper: drop the in-memory caches but keep the saved copy, as a page reload does. */
export function forgetMentionsMemory(): void {
  notificationsCache = { since: null, lastModified: null, notifications: [] };
  threadComments.clear();
  subjectStates.clear();
  hydrated = false;
}

/**
 * Drop the cached notification list, subject states and per-thread comments. Cleared whenever
 * settings change (a new token or user sees a different inbox).
 */
export function resetMentionsCache(): void {
  notificationsCache = { since: null, lastModified: null, notifications: [] };
  threadComments.clear();
  subjectStates.clear();
  // Nothing saved to read back: the copy below is gone.
  hydrated = true;
  try {
    localStorage.removeItem(MENTIONS_CACHE_KEY);
  } catch {
    /* storage unavailable */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, resetMentionsCache);
}

/**
 * Drop per-thread subject states and comments for threads not in `threadIds`
 * (the current capped set), so the caches stay bounded in long-lived tabs.
 */
export function pruneMentionsCache(threadIds: Iterable<string>): void {
  const keep = new Set(threadIds);
  for (const map of [threadComments, subjectStates]) {
    for (const key of map.keys()) {
      if (!keep.has(key)) map.delete(key);
    }
  }
}

/**
 * Fetch pages of notifications from the GitHub REST API (newest first),
 * filtered to only relevant participation reasons. Paging stops once a page
 * brings the count to MAX_MENTION_THREADS, since only the newest are used.
 * The first page is a conditional request when a previous list is cached;
 * a 304 returns the cached list without fetching further pages. A 304 with
 * nothing cached for this window (not expected) yields an empty list and
 * leaves the cache empty, so the next call does a full fetch.
 */
export async function fetchAllNotifications(
  github: HttpClient,
  since: string,
  signal?: AbortSignal,
): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  const perPage = 100;
  const cached = notificationsCache.since === since ? notificationsCache : null;
  let lastModified: string | null = null;

  while (true) {
    const conditional = page === 1 && cached?.lastModified;
    const response = await github.get("/notifications", {
      params: { participating: true, all: true, per_page: perPage, since, page },
      ...(conditional ? { headers: { "If-Modified-Since": conditional } } : {}),
      validateStatus: (s: number) => (s >= 200 && s < 300) || s === 304,
      signal,
    });
    if (response.status === 304) {
      if (cached) return cached.notifications;
      notificationsCache = { since: null, lastModified: null, notifications: [] };
      return [];
    }
    if (page === 1) lastModified = response.headers?.["last-modified"] ?? null;

    const data = response.data;
    for (const n of data) {
      if (ALLOWED_REASONS.has(n.reason)) all.push(trimNotification(n));
    }
    if (data.length < perPage || all.length >= MAX_MENTION_THREADS) break;
    page++;
  }

  notificationsCache = { since, lastModified, notifications: all };
  return all;
}

/** Owner, repo and number of an issue/PR subject URL; null for other subjects (releases, commits…). */
export function subjectRef(
  url: string | null | undefined,
): { owner: string; repo: string; number: number } | null {
  const m = url?.match(/\/repos\/([^/]+)\/([^/]+)\/(?:pulls|issues)\/(\d+)$/);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

/**
 * Filter out notifications whose subject (PR/issue) is no longer open. Threads
 * whose `updated_at` matches a cached state reuse it (cached "open" states are
 * rechecked after SUBJECT_OPEN_TTL_MS); the rest are asked about in one
 * batched GraphQL request. Freshly fetched subjects ride along as `_subject`,
 * so the comment step needn't fetch a PR/issue that is its own latest event.
 * Anything unknown (a null alias, a failed request) is kept and not cached, so
 * it's retried next time. Subjects without an issue/PR number are kept unchecked.
 */
export async function filterOpenNotifications(
  notifications: any[],
  signal?: AbortSignal,
): Promise<any[]> {
  const now = Date.now();
  const toCheck: { n: any; ref: NonNullable<ReturnType<typeof subjectRef>> }[] = [];
  for (const n of notifications) {
    const ref = subjectRef(n.subject?.url);
    if (!ref) continue;
    const cached = subjectStates.get(String(n.id));
    const fresh =
      cached &&
      cached.updatedAt === n.updated_at &&
      (!cached.open || now - cached.checkedAt < SUBJECT_OPEN_TTL_MS);
    if (!fresh) toCheck.push({ n, ref });
  }

  const subjects = new Map<string, any>();
  if (toCheck.length > 0) {
    const variables: Record<string, string | number> = {};
    toCheck.forEach(({ ref }, i) => {
      variables[`o${i}`] = ref.owner;
      variables[`r${i}`] = ref.repo;
      variables[`n${i}`] = ref.number;
    });
    try {
      const data = await githubGraphql<Record<string, any>>(
        buildSubjectStatesQuery(toCheck.length),
        variables,
        { signal, allowPartial: true },
      );
      toCheck.forEach(({ n }, i) => {
        const subject = data?.[`s${i}`]?.issueOrPullRequest;
        if (!subject) return;
        const state = subject.prState ?? subject.issueState;
        subjectStates.set(String(n.id), {
          updatedAt: n.updated_at,
          open: state === "OPEN",
          checkedAt: now,
        });
        subjects.set(String(n.id), subject);
      });
    } catch {
      // The whole request failed: keep every thread, cache none.
    }
  }

  return notifications.flatMap((n) => {
    const id = String(n.id);
    const state = subjectStates.get(id);
    // Only a state recorded for this exact update can drop a thread.
    if (state && state.updatedAt === n.updated_at && !state.open) return [];
    const subject = subjects.get(id);
    return [subject ? { ...n, _subject: subject } : n];
  });
}

/** Map one notification to its mention (latest comment, or notification-level info). */
async function fetchNotificationComment(notification: any, github: HttpClient): Promise<any> {
  const commentUrl = notification.subject?.latest_comment_url;
  if (commentUrl) {
    // When the latest event is the PR/issue itself, its URL is the subject URL,
    // which the batched open-state check may already have fetched.
    const s = commentUrl === notification.subject?.url ? notification._subject : null;
    const comment = s
      ? {
          id: s.databaseId,
          html_url: s.url,
          body: s.body,
          created_at: s.createdAt,
          updated_at: s.updatedAt,
          user: { login: s.author?.login, avatar_url: s.author?.avatarUrl },
        }
      : (await github.get(commentUrl)).data;
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
      pr_number: extractSubjectNumber(notification.subject?.url),
      repo_full_name: notification.repository?.full_name || "",
      context_title: notification.subject?.title || "",
      reason: notification.reason || "",
    };
  }
  // No comment URL — use notification-level info
  return {
    id: notification.id,
    html_url: subjectUrlToHtml(notification.subject?.url, notification.repository?.full_name || ""),
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
}

/**
 * Fetch notification comments with controlled concurrency.
 * Processes in batches to avoid overwhelming the API. Threads whose
 * `updated_at` matches the cached entry reuse it without a request.
 */
export async function fetchCommentsInBatches(
  notifications: any[],
  github: HttpClient,
  batchSize: number = 10,
): Promise<any[]> {
  const results: any[] = [];
  const toFetch: any[] = [];
  for (const notification of notifications) {
    const cached = threadComments.get(String(notification.id));
    if (cached && cached.updatedAt === notification.updated_at) {
      results.push(...cached.comments);
    } else {
      toFetch.push(notification);
    }
  }

  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (notification: any) => {
        try {
          const comment = await fetchNotificationComment(notification, github);
          threadComments.set(String(notification.id), {
            updatedAt: notification.updated_at,
            comments: [comment],
          });
          return comment;
        } catch {
          // Not cached, so the next refresh retries it.
          return null;
        }
      }),
    );
    results.push(...batchResults.filter(Boolean));
  }

  return results;
}
