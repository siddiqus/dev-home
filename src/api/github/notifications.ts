import type { AxiosInstance } from "axios";
import { SETTINGS_EVENT } from "../../services/config";

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
 */
const subjectStates = new Map<string, { updatedAt: string; open: boolean }>();

/**
 * Drop the cached notification list, subject states and per-thread comments. Cleared whenever
 * settings change (a new token or user sees a different inbox).
 */
export function resetMentionsCache(): void {
  notificationsCache = { since: null, lastModified: null, notifications: [] };
  threadComments.clear();
  subjectStates.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, resetMentionsCache);
}

/**
 * Fetch all pages of notifications from the GitHub REST API,
 * filtered to only relevant participation reasons.
 * The first page is a conditional request when a previous list is cached;
 * a 304 returns the cached list without fetching further pages.
 */
export async function fetchAllNotifications(github: AxiosInstance, since: string): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  const perPage = 100;
  const cached = notificationsCache.since === since ? notificationsCache : null;
  let lastModified: string | null = null;

  while (true) {
    const conditional = page === 1 && cached?.lastModified;
    const response = await github.get("/notifications", {
      params: { participating: true, all: true, per_page: perPage, since, page },
      ...(conditional
        ? {
            headers: { "If-Modified-Since": conditional },
            validateStatus: (s: number) => (s >= 200 && s < 300) || s === 304,
          }
        : {}),
    });
    if (response.status === 304 && cached) return cached.notifications;
    if (page === 1) lastModified = response.headers?.["last-modified"] ?? null;

    const data = response.data;
    for (const n of data) {
      if (ALLOWED_REASONS.has(n.reason)) all.push(n);
    }
    if (data.length < perPage) break;
    page++;
  }

  notificationsCache = { since, lastModified, notifications: all };
  return all;
}

/**
 * Filter out notifications whose subject (PR/issue) is no longer open.
 * Fetches the subject URL in batches to check state; threads whose
 * `updated_at` matches a cached state reuse it without a request.
 */
export async function filterOpenNotifications(
  notifications: any[],
  github: AxiosInstance,
  batchSize: number = 10,
): Promise<any[]> {
  const results: any[] = [];

  for (let i = 0; i < notifications.length; i += batchSize) {
    const batch = notifications.slice(i, i + batchSize);
    const checked = await Promise.all(
      batch.map(async (notification: any) => {
        const subjectUrl = notification.subject?.url;
        if (!subjectUrl) return notification;
        const key = String(notification.id);
        const cached = subjectStates.get(key);
        if (cached && cached.updatedAt === notification.updated_at) {
          return cached.open ? notification : null;
        }
        try {
          const { data: subject } = await github.get(subjectUrl);
          // PRs have "state" (open/closed) and "merged" boolean
          // Issues have "state" (open/closed)
          const open = !(subject.state && subject.state !== "open");
          subjectStates.set(key, { updatedAt: notification.updated_at, open });
          return open ? notification : null;
        } catch {
          // If we can't fetch the subject, include it (fail open); not cached, so it's retried
          return notification;
        }
      }),
    );
    results.push(...checked.filter(Boolean));
  }

  return results;
}

/** Map one notification to its mention (latest comment, or notification-level info). */
async function fetchNotificationComment(notification: any, github: AxiosInstance): Promise<any> {
  const commentUrl = notification.subject?.latest_comment_url;
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
  github: AxiosInstance,
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
