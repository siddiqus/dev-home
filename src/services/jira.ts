import { JiraIssue, JiraComment } from "../types";
import { getIssues, postIssuesBulk, getJiraMentions } from "../api/jira";

export async function fetchAssignedIssues(signal?: AbortSignal): Promise<JiraIssue[]> {
  const { issues } = await getIssues(signal);
  return issues;
}

/**
 * Fetch issues by key. `withDetail` (default true) includes description and
 * issue type; list enrichment passes false to keep payloads and cache small.
 */
export async function fetchIssuesByKeys(
  keys: string[],
  opts: { withDetail?: boolean; signal?: AbortSignal } = {},
): Promise<JiraIssue[]> {
  if (keys.length === 0) return [];
  const { issues } = await postIssuesBulk({ keys, ...opts });
  return issues;
}

export async function fetchRecentMentions(signal?: AbortSignal): Promise<JiraComment[]> {
  const { comments } = await getJiraMentions(signal);
  return comments;
}

// Descriptions shared across every drawer/modal for the session, so reopening an
// issue (even from another tab or after a remount) never refetches. Failures are
// evicted so the next open retries.
const descriptionCache = new Map<string, Promise<string>>();

/** Lazily fetch (and cache) an issue's description as markdown. */
export function fetchIssueDescription(key: string): Promise<string> {
  let pending = descriptionCache.get(key);
  if (!pending) {
    pending = fetchIssuesByKeys([key]).then((issues) => issues[0]?.description || "");
    pending.catch(() => descriptionCache.delete(key));
    descriptionCache.set(key, pending);
  }
  return pending;
}
