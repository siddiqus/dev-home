import { describe, expect, it } from "vitest";
import type {
  GitHubPR,
  PRCommentAuthor,
  PRComments,
  PRConversationItem,
  PRReviewThread,
} from "../types";
import { commentCounts, isUnreadComment, loadedCommentCounts } from "./commentCounts";

const READ = "2026-10-10T12:00:00Z";
const pr = (fields: Partial<GitHubPR>) => fields as GitHubPR;

describe("commentCounts", () => {
  it("is null when the PR carries no comment data", () => {
    expect(commentCounts(pr({}), READ, "me")).toBeNull();
    expect(commentCounts(pr({ recent_comments: [] }), READ, "me")).toBeNull();
  });

  it("counts recent comments by others after the read marker", () => {
    const counts = commentCounts(
      pr({
        comment_count: 12,
        recent_comments: [
          { at: "2026-10-09T00:00:00Z", by: "bob" }, // before
          { at: "2026-10-10T12:00:00Z", by: "bob" }, // exactly at: read
          { at: "2026-10-11T00:00:00Z", by: "bob" },
          { at: "2026-10-11T01:00:00Z", by: "Me" }, // the viewer, any case
          { at: "2026-10-12T00:00:00Z", by: "carol" },
        ],
      }),
      READ,
      "me",
    );
    expect(counts).toEqual({ total: 12, unread: 2, unreadAtLeast: false });
  });

  it("compares times numerically, not as strings", () => {
    // Same instant as READ in another offset reads as read; a later one with millis as new.
    const counts = commentCounts(
      pr({
        comment_count: 2,
        recent_comments: [
          { at: "2026-10-10T14:00:00+02:00", by: "bob" },
          { at: "2026-10-10T12:00:00.500Z", by: "bob" },
        ],
      }),
      READ,
      "me",
    );
    expect(counts?.unread).toBe(1);
  });

  it("treats missing recent comments as none, and a null viewer excludes nobody", () => {
    expect(commentCounts(pr({ comment_count: 3 }), READ, "me")).toEqual({
      total: 3,
      unread: 0,
      unreadAtLeast: false,
    });
    const mine = pr({
      comment_count: 1,
      recent_comments: [{ at: "2026-10-11T00:00:00Z", by: "me" }],
    });
    expect(commentCounts(mine, READ, null)?.unread).toBe(1);
  });

  it("flags a lower bound when unfetched comments may be newer than the marker", () => {
    const base = { comment_count: 40, recent_comments: [] };
    expect(
      commentCounts(pr({ ...base, comments_complete_after: "2026-10-11T00:00:00Z" }), READ, "me")
        ?.unreadAtLeast,
    ).toBe(true);
    expect(
      commentCounts(pr({ ...base, comments_complete_after: READ }), READ, "me")?.unreadAtLeast,
    ).toBe(false);
    expect(
      commentCounts(pr({ ...base, comments_complete_after: "2026-10-01T00:00:00Z" }), READ, "me")
        ?.unreadAtLeast,
    ).toBe(false);
  });

  it("flags a lower bound when threads beyond the list's limit weren't fetched", () => {
    const counts = commentCounts(
      pr({ comment_count: 60, recent_comments: [], comment_threads_cut_off: true }),
      READ,
      "me",
    );
    expect(counts?.unreadAtLeast).toBe(true);
  });
});

describe("isUnreadComment", () => {
  const user = (login: string, is_bot = false) => ({ login, is_bot });

  it("is unread when someone else posted after the marker", () => {
    expect(isUnreadComment(user("bob"), "2026-10-11T00:00:00Z", READ, "me")).toBe(true);
    expect(isUnreadComment(user("bob"), "2026-10-09T00:00:00Z", READ, "me")).toBe(false);
    expect(isUnreadComment(user("bob"), READ, READ, "me")).toBe(false);
  });

  it("skips the viewer (any case) and bots", () => {
    expect(isUnreadComment(user("ME"), "2026-10-11T00:00:00Z", READ, "me")).toBe(false);
    expect(isUnreadComment(user("me"), "2026-10-11T00:00:00Z", READ, null)).toBe(true);
    expect(isUnreadComment(user("sonar", true), "2026-10-11T00:00:00Z", READ, "me")).toBe(false);
    // is_bot is the whole test: mapAuthor already folds name-based bots into it.
    expect(isUnreadComment(user("github-actions"), "2026-10-11T00:00:00Z", READ, "me")).toBe(true);
  });
});

describe("loadedCommentCounts", () => {
  const author = (login: string, is_bot = false): PRCommentAuthor => ({
    login,
    avatar_url: "",
    is_bot,
  });
  const threadComment = (login: string, created_at: string, is_bot = false) => ({
    id: 1,
    author: author(login, is_bot),
    body: "",
    created_at,
    html_url: "",
  });
  const thread = (comments: PRReviewThread["comments"]) =>
    ({ id: "t", comments }) as unknown as PRReviewThread;
  const item = (
    kind: PRConversationItem["kind"],
    login: string,
    created_at: string,
  ): PRConversationItem => ({
    kind,
    id: "c",
    author: author(login),
    body: "",
    created_at,
    html_url: "",
  });

  it("counts thread comments and conversation comments, not reviews", () => {
    const comments: PRComments = {
      threads: [
        thread([
          threadComment("bob", "2026-10-09T00:00:00Z"),
          threadComment("me", "2026-10-11T00:00:00Z"),
          threadComment("bob", "2026-10-11T02:00:00Z"),
        ]),
        thread([threadComment("codecov", "2026-10-11T03:00:00Z", true)]),
      ],
      conversation: [
        item("comment", "carol", "2026-10-11T04:00:00Z"),
        item("review", "carol", "2026-10-11T05:00:00Z"),
        item("comment", "dave", "2026-10-01T00:00:00Z"),
      ],
      truncated: true,
    };
    expect(loadedCommentCounts(comments, READ, "me")).toEqual({
      total: 6,
      unread: 2,
      unreadAtLeast: false,
    });
  });

  it("is zero for an empty PR", () => {
    expect(
      loadedCommentCounts({ threads: [], conversation: [], truncated: false }, READ, "me"),
    ).toEqual({ total: 0, unread: 0, unreadAtLeast: false });
  });
});

describe("commentCounts totals", () => {
  it("marks the total a lower bound when threads were cut off", () => {
    const pr = { comment_count: 30, recent_comments: [], comment_threads_cut_off: true } as never;
    expect(commentCounts(pr, "2026-10-01T00:00:00Z", null)).toMatchObject({
      total: 30,
      totalAtLeast: true,
    });
    const whole = { comment_count: 30, recent_comments: [] } as never;
    expect(commentCounts(whole, "2026-10-01T00:00:00Z", null)?.totalAtLeast).toBeFalsy();
  });
});
