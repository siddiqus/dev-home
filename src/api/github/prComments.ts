import type {
  DiffHunkLine,
  PRCommentAuthor,
  PRComments,
  PRConversationItem,
  PRReviewThread,
  PRThreadComment,
  PRThreadStatus,
} from "../../types";
import { isBot } from "./mapping";

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * The last `maxLines` lines of a review comment's `diffHunk`. GitHub ends the
 * hunk on the commented line, so its tail is the context worth showing. Line
 * numbers come from the `@@` header (null when it's missing or malformed).
 */
export function hunkTail(diffHunk: string, maxLines = 4): DiffHunkLine[] {
  if (!diffHunk) return [];
  const rows = diffHunk.replace(/\r?\n$/, "").split(/\r?\n/);
  const hasHeader = rows[0].startsWith("@@");
  const header = hasHeader ? rows[0].match(HUNK_HEADER) : null;
  let oldLine = header ? Number(header[1]) : null;
  let newLine = header ? Number(header[2]) : null;

  const lines: DiffHunkLine[] = [];
  for (const row of hasHeader ? rows.slice(1) : rows) {
    if (row.startsWith("\\")) continue; // "\ No newline at end of file"
    const marker = row[0];
    const text = row.slice(1);
    if (marker === "+") {
      lines.push({ kind: "add", line: newLine, text });
      if (newLine !== null) newLine++;
    } else if (marker === "-") {
      lines.push({ kind: "del", line: oldLine, text });
      if (oldLine !== null) oldLine++;
    } else {
      lines.push({ kind: "context", line: newLine, text });
      if (newLine !== null) newLine++;
      if (oldLine !== null) oldLine++;
    }
  }
  return lines.slice(-maxLines);
}

/** GitHub reports deleted accounts as a null author; it shows them as "ghost". */
function mapAuthor(a: any): PRCommentAuthor {
  if (!a) return { login: "ghost", avatar_url: "https://github.com/ghost.png", is_bot: false };
  const login: string = a.login || "";
  return {
    login,
    avatar_url: a.avatarUrl || "",
    // Bot accounts (codecov, sonarcloud) carry no "[bot]" suffix in GraphQL.
    is_bot: a.__typename === "Bot" || (login !== "" && isBot(login)),
  };
}

function mapComment(c: any): PRThreadComment {
  return {
    id: c.databaseId,
    author: mapAuthor(c.author),
    body: c.body || "",
    created_at: c.createdAt,
    html_url: c.url,
  };
}

/** ISO timestamps from GitHub sort correctly as strings. */
function byTime(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * An empty COMMENTED review only wraps inline comments, which already show as
 * threads; PENDING reviews are the viewer's unsubmitted drafts.
 */
function isShownReview(r: any): boolean {
  if (!r.submittedAt) return false;
  if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED") {
    return true;
  }
  return r.state === "COMMENTED" && !!r.body?.trim();
}

/** A thread node's state (resolved wins over outdated) and the viewer's actions on it. */
export function threadStatus(t: any): PRThreadStatus {
  return {
    state: t.isResolved ? "resolved" : t.isOutdated ? "outdated" : "open",
    can_resolve: !!t.viewerCanResolve,
    can_unresolve: !!t.viewerCanUnresolve,
  };
}

/** `comments` with one thread's status changed. */
export function withThreadStatus(
  comments: PRComments,
  threadId: string,
  status: Partial<PRThreadStatus>,
): PRComments {
  return {
    ...comments,
    threads: comments.threads.map((t) => (t.id === threadId ? { ...t, ...status } : t)),
  };
}

/** Map PR_COMMENTS_QUERY's `pullRequest` node for the PR modal's Comments tab. */
export function mapPrComments(raw: any): PRComments {
  if (!raw) return { threads: [], conversation: [], truncated: false };

  const threads: PRReviewThread[] = [];
  for (const t of raw.reviewThreads?.nodes || []) {
    const comments: PRThreadComment[] = (t.comments?.nodes || []).map(mapComment);
    if (comments.length === 0) continue;
    threads.push({
      id: t.id,
      path: t.path,
      line: t.line ?? t.originalLine ?? null,
      ...threadStatus(t),
      hunk: hunkTail(t.comments.nodes[0].diffHunk),
      comments,
      html_url: comments[0].html_url,
    });
  }
  threads.sort((a, b) => byTime(a.comments[0].created_at, b.comments[0].created_at));

  const conversation: PRConversationItem[] = [
    ...(raw.comments?.nodes || []).map(
      (c: any): PRConversationItem => ({
        kind: "comment",
        ...mapComment(c),
        id: `c${c.databaseId}`,
      }),
    ),
    ...(raw.reviews?.nodes || []).filter(isShownReview).map(
      (r: any): PRConversationItem => ({
        kind: "review",
        id: `r${r.databaseId}`,
        author: mapAuthor(r.author),
        body: r.body || "",
        created_at: r.submittedAt,
        html_url: r.url,
        verdict: r.state,
      }),
    ),
  ];
  conversation.sort((a, b) => byTime(a.created_at, b.created_at));

  return {
    threads,
    conversation,
    // Older threads/items past the newest 100, or replies past a thread's first 50.
    truncated:
      [raw.reviewThreads, raw.comments, raw.reviews].some((c) => c?.pageInfo?.hasPreviousPage) ||
      (raw.reviewThreads?.nodes || []).some((t: any) => t.comments?.pageInfo?.hasNextPage),
  };
}
