import { jiraClient, requireSettings } from "../http";
import { adfToMarkdown } from "./adf";

/** Fields shared by every issue list (assigned, by-key, JQL search). */
export const BASE_ISSUE_FIELDS = [
  "summary",
  "status",
  "priority",
  "assignee",
  "reporter",
  "project",
  "created",
  "updated",
];

/** Map a raw Jira search issue to the app's JiraIssue shape. */
export function mapIssue(issue: any, opts: { withDetail?: boolean } = {}): any {
  const f = issue.fields ?? {};
  const mapped: any = {
    key: issue.key,
    summary: f.summary,
    status: {
      name: f.status?.name,
      statusCategory: { colorName: f.status?.statusCategory?.colorName },
    },
    priority: { name: f.priority?.name, iconUrl: f.priority?.iconUrl },
    assignee: f.assignee
      ? { displayName: f.assignee.displayName, avatarUrls: f.assignee.avatarUrls }
      : null,
    reporter: f.reporter
      ? { displayName: f.reporter.displayName, avatarUrls: f.reporter.avatarUrls }
      : null,
    project: { key: f.project?.key, name: f.project?.name },
    created: f.created,
    updated: f.updated,
  };
  if (opts.withDetail) {
    mapped.description = adfToMarkdown(f.description);
    mapped.issueType = {
      name: f.issuetype?.name || null,
      iconUrl: f.issuetype?.iconUrl || null,
    };
  }
  return mapped;
}

/** Upper bound on assigned issues fetched across pages. */
const MAX_ASSIGNED_ISSUES = 500;
/** Keys per `key IN (...)` request; Jira caps a search page at 100. */
const KEY_BATCH_SIZE = 50;

/**
 * GET /api/jira/issues → getIssues()
 * Fetch unresolved issues assigned to the current user, following
 * nextPageToken (Jira's default page of 50 would otherwise truncate silently).
 */
export async function getIssues(signal?: AbortSignal): Promise<{ issues: any[] }> {
  const jira = jiraClient();

  const jql = `assignee = currentUser() AND resolution = Unresolved AND statusCategory != Done AND updated >= -90d ORDER BY updated DESC`;
  const raw: any[] = [];
  let nextPageToken: string | undefined;
  do {
    const payload: Record<string, any> = { jql, fields: BASE_ISSUE_FIELDS, maxResults: 100 };
    if (nextPageToken) payload.nextPageToken = nextPageToken;
    const { data } = await jira.post("/search/jql", payload, { signal });
    raw.push(...(data.issues || []));
    nextPageToken = data.nextPageToken || undefined;
  } while (nextPageToken && raw.length < MAX_ASSIGNED_ISSUES);

  return { issues: raw.map((issue) => mapIssue(issue)) };
}

/** Issue keys Jira rejected in a 400 error (e.g. "An issue with key 'UTF-8' does not exist"). */
function rejectedKeys(err: unknown): string[] {
  const message = (err as { message?: string })?.message || "";
  return [...message.matchAll(/'([A-Za-z][A-Za-z0-9_]*-\d+)'/g)].map((m) => m[1].toUpperCase());
}

async function searchKeys(keys: string[], fields: string[], signal?: AbortSignal): Promise<any[]> {
  const jira = jiraClient();
  const keyList = keys.map((k: string) => `"${k}"`).join(", ");
  const jql = `key IN (${keyList}) ORDER BY updated DESC`;
  try {
    const { data } = await jira.post(
      "/search/jql",
      { jql, fields, maxResults: keys.length },
      { signal },
    );
    return data.issues || [];
  } catch (err) {
    // One nonexistent key (e.g. "SHA-256" picked out of a PR title) fails the
    // whole `key IN` search. Drop the keys Jira names and retry once.
    const bad = new Set(rejectedKeys(err));
    if ((err as { status?: number })?.status !== 400 || bad.size === 0) throw err;
    const remaining = keys.filter((k) => !bad.has(k.toUpperCase()));
    if (remaining.length === 0) return [];
    if (remaining.length === keys.length) throw err;
    return searchKeys(remaining, fields, signal);
  }
}

/**
 * POST /api/jira/issues/bulk → postIssuesBulk({ keys })
 * Fetch issues by their keys (e.g. ["CCP-123", "CCP-456"]), in batches.
 * `withDetail` adds description + issue type (for drawers, not list enrichment).
 */
export async function postIssuesBulk(args: {
  keys: string[];
  withDetail?: boolean;
  signal?: AbortSignal;
}): Promise<{ issues: any[] }> {
  const { keys, withDetail = true, signal } = args;
  if (!Array.isArray(keys) || keys.length === 0) {
    return { issues: [] };
  }

  const fields = withDetail
    ? [...BASE_ISSUE_FIELDS, "description", "issuetype"]
    : BASE_ISSUE_FIELDS;
  const batches: string[][] = [];
  for (let i = 0; i < keys.length; i += KEY_BATCH_SIZE) {
    batches.push(keys.slice(i, i + KEY_BATCH_SIZE));
  }
  const results = await Promise.all(batches.map((batch) => searchKeys(batch, fields, signal)));
  return { issues: results.flat().map((issue) => mapIssue(issue, { withDetail })) };
}

/**
 * GET /api/jira/mentions → getJiraMentions()
 * Fetch recent comments that mention the current user.
 */
export async function getJiraMentions(signal?: AbortSignal): Promise<{ comments: any[] }> {
  const config = requireSettings();
  const jira = jiraClient();

  // Extract username from email (part before @)
  const username = config.jiraEmail.split("@")[0];

  const jql = `text ~ "${config.jiraEmail}" AND resolution = Unresolved AND statusCategory != Done AND updated >= -90d ORDER BY updated DESC`;
  // Comments come inline with the search; only truncated lists need a follow-up call.
  const fields = ["summary", "comment"];
  const maxResults = 20;

  const { data: searchData } = await jira.post(
    "/search/jql",
    { jql, fields, maxResults },
    { signal },
  );
  const issues = searchData.issues || [];
  // Real @mentions store the account id (plus "@Display Name"), never the
  // email, so match on those when the current user can be resolved.
  const me = issues.length > 0 ? await getMyself() : null;
  const needles = [config.jiraEmail, username, me?.displayName]
    .filter((n): n is string => !!n)
    .map((n) => n.toLowerCase());

  const issueComments = async (issue: any): Promise<any[]> => {
    const inline = issue.fields?.comment;
    if (Array.isArray(inline?.comments) && !(inline.total > inline.comments.length)) {
      return inline.comments;
    }
    const { data: commentData } = await jira.get(`/issue/${issue.key}/comment`, { signal });
    return commentData.comments || [];
  };

  const commentPromises = issues.map(async (issue: any) => {
    try {
      const comments = await issueComments(issue);

      // Keep comments that @mention the user, or name their email/username
      return comments
        .filter((comment: any) => {
          if (me?.accountId && adfMentions(comment.body, me.accountId)) return true;
          const bodyText = adfToMarkdown(comment.body).toLowerCase();
          return needles.some((n) => bodyText.includes(n));
        })
        .map((comment: any) => ({
          id: comment.id,
          author: {
            displayName: comment.author?.displayName,
            avatarUrls: comment.author?.avatarUrls,
          },
          body: {
            text: adfToMarkdown(comment.body),
          },
          created: comment.created,
          updated: comment.updated,
          issueKey: issue.key,
          issueSummary: issue.fields?.summary,
        }));
    } catch (err: any) {
      console.error(`[JIRA /mentions] Exception fetching comments for ${issue.key}:`, err.message);
      return [];
    }
  });

  const commentResults = await Promise.allSettled(commentPromises);
  const allComments = commentResults
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // Sort by updated DESC
  allComments.sort((a: any, b: any) => {
    return new Date(b.updated).getTime() - new Date(a.updated).getTime();
  });

  return { comments: allComments };
}

/** True if an ADF document contains a mention node for `accountId`. */
function adfMentions(node: any, accountId: string): boolean {
  if (!node || typeof node !== "object") return false;
  if (node.type === "mention" && node.attrs?.id === accountId) return true;
  return Array.isArray(node.content) && node.content.some((c: any) => adfMentions(c, accountId));
}

let myselfCache: {
  key: string;
  value: Promise<{ accountId: string; displayName: string } | null>;
} | null = null;

/** Test hook: forget the cached current user. */
export function resetMyselfCache(): void {
  myselfCache = null;
}

/**
 * Current Jira user (cached per credentials), resolved via user search on the
 * configured email — the proxy deliberately doesn't expose /myself. Resolves
 * null on failure.
 */
export function getMyself(): Promise<{ accountId: string; displayName: string } | null> {
  const s = requireSettings();
  const key = `${s.jiraBaseUrl}|${s.jiraEmail}`;
  if (myselfCache?.key !== key) {
    const email = s.jiraEmail.toLowerCase();
    const value = jiraClient()
      .get("/user/search", { params: { query: s.jiraEmail, maxResults: 5 } })
      .then(({ data }) => {
        const users: any[] = Array.isArray(data) ? data : [];
        const me =
          users.find((u) => String(u.emailAddress || "").toLowerCase() === email) ??
          (users.length === 1 ? users[0] : undefined);
        return me?.accountId ? { accountId: me.accountId, displayName: me.displayName } : null;
      })
      .catch(() => {
        // Don't cache failures; retry on the next call.
        if (myselfCache?.value === value) myselfCache = null;
        return null;
      });
    myselfCache = { key, value };
  }
  return myselfCache.value;
}
