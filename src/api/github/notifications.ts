import type { AxiosInstance } from "axios";

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

/**
 * Fetch all pages of notifications from the GitHub REST API,
 * filtered to only relevant participation reasons.
 */
export async function fetchAllNotifications(github: AxiosInstance, since: string): Promise<any[]> {
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
export async function fetchCommentsInBatches(
  notifications: any[],
  github: AxiosInstance,
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
