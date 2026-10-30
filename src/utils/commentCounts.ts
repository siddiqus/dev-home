import type { GitHubPR, PRComments } from "../types";

/** A PR's comment count and how many of them the viewer hasn't opened yet. */
export interface CommentCounts {
  total: number;
  unread: number;
  /** `unread` is a lower bound: older comments weren't fetched ("20+ new"). */
  unreadAtLeast: boolean;
  /** `total` is a lower bound too: some threads weren't fetched ("30+"). */
  totalAtLeast?: boolean;
}

/** Epoch ms, so offsets and fractional seconds compare correctly; NaN when unparsable. */
const time = (iso: string) => new Date(iso).getTime();

const isViewer = (login: string, viewer: string | null) =>
  !!viewer && login.toLowerCase() === viewer.toLowerCase();

/**
 * Counts from the list data on `pr`: `comment_count` total, and unread =
 * `recent_comments` by someone other than `viewer` posted after `readAt`
 * (bots are already left out of recent_comments). `unreadAtLeast` when
 * `comments_complete_after` is later than `readAt`, or threads were cut off
 * (`comment_threads_cut_off`). Null when the PR carries no comment data
 * (`comment_count` undefined).
 */
export function commentCounts(
  pr: GitHubPR,
  readAt: string,
  viewer: string | null,
): CommentCounts | null {
  if (pr.comment_count === undefined) return null;
  const read = time(readAt);
  const unread = (pr.recent_comments ?? []).filter(
    (c) => time(c.at) > read && !isViewer(c.by, viewer),
  ).length;
  const cutOff = pr.comments_complete_after;
  return {
    total: pr.comment_count,
    totalAtLeast: pr.comment_threads_cut_off || undefined,
    unread,
    unreadAtLeast: !!pr.comment_threads_cut_off || (!!cutOff && time(cutOff) > read),
  };
}

/**
 * Exact counts from a PR's loaded comments (the modal's Comments tab): total =
 * thread comments + conversation items of kind "comment"; unread = those by a
 * non-bot author other than `viewer`, created after `readAt`. Never "at least".
 */
export function loadedCommentCounts(
  comments: PRComments,
  readAt: string,
  viewer: string | null,
): CommentCounts {
  const all = [
    ...comments.threads.flatMap((t) => t.comments),
    ...comments.conversation.filter((c) => c.kind === "comment"),
  ];
  return {
    total: all.length,
    unread: all.filter((c) => isUnreadComment(c.author, c.created_at, readAt, viewer)).length,
    unreadAtLeast: false,
  };
}

/**
 * Whether one comment counts as unread: created after `readAt`, by a non-bot
 * author other than `viewer` (case-insensitive login compare). `is_bot` already
 * covers name-matched bots (mapAuthor folds isBot in), matching the bots the
 * list's recent_comments leave out, so the tab's count agrees with the chip's.
 */
export function isUnreadComment(
  author: { login: string; is_bot: boolean },
  createdAt: string,
  readAt: string,
  viewer: string | null,
): boolean {
  if (author.is_bot || isViewer(author.login, viewer)) return false;
  return time(createdAt) > time(readAt);
}
