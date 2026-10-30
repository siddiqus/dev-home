import { describe, it, expect } from "vitest";
import { hunkTail, mapPrComments, threadStatus, withThreadStatus } from "./prComments";

describe("hunkTail", () => {
  const HUNK = [
    "@@ -80,4 +80,5 @@ export function foo() {",
    " const a = 1;",
    "-const b = 2;",
    "+const b = 3;",
    "+const c = 4;",
    " return a;",
  ].join("\n");

  it("numbers context and added lines on the new side, deletions on the old", () => {
    expect(hunkTail(HUNK, 10)).toEqual([
      { kind: "context", line: 80, text: "const a = 1;" },
      { kind: "del", line: 81, text: "const b = 2;" },
      { kind: "add", line: 81, text: "const b = 3;" },
      { kind: "add", line: 82, text: "const c = 4;" },
      { kind: "context", line: 83, text: "return a;" },
    ]);
  });

  it("keeps the last four lines by default", () => {
    expect(hunkTail(HUNK).map((l) => l.text)).toEqual([
      "const b = 2;",
      "const b = 3;",
      "const c = 4;",
      "return a;",
    ]);
  });

  it("skips no-newline markers", () => {
    const hunk = "@@ -1,1 +1,1 @@\n-old\n\\ No newline at end of file\n+new";
    expect(hunkTail(hunk)).toEqual([
      { kind: "del", line: 1, text: "old" },
      { kind: "add", line: 1, text: "new" },
    ]);
  });

  it("ignores a trailing newline", () => {
    expect(hunkTail("@@ -1,1 +1,1 @@\n+new\n")).toEqual([{ kind: "add", line: 1, text: "new" }]);
  });

  it("reads a header without line counts", () => {
    expect(hunkTail("@@ -5 +7 @@\n same")).toEqual([{ kind: "context", line: 7, text: "same" }]);
  });

  it("keeps the lines without numbers when the header is missing or malformed", () => {
    expect(hunkTail("+added\n kept")).toEqual([
      { kind: "add", line: null, text: "added" },
      { kind: "context", line: null, text: "kept" },
    ]);
    expect(hunkTail("@@ garbage @@\n-gone")).toEqual([{ kind: "del", line: null, text: "gone" }]);
  });

  it("returns nothing for an empty or missing hunk", () => {
    expect(hunkTail("")).toEqual([]);
    expect(hunkTail(undefined as unknown as string)).toEqual([]);
  });
});

const author = (login: string, typename = "User") => ({
  __typename: typename,
  login,
  avatarUrl: `https://a/${login}`,
});

const comment = (id: number, createdAt: string, extra: Record<string, unknown> = {}) => ({
  databaseId: id,
  body: `comment ${id}`,
  createdAt,
  url: `https://github.com/o/r/pull/1#c${id}`,
  author: author("bob"),
  ...extra,
});

const review = (id: number, state: string, body = "", submittedAt: string | null = "T5") => ({
  databaseId: id,
  state,
  body,
  submittedAt,
  url: `https://github.com/o/r/pull/1#r${id}`,
  author: author("carol"),
});

function node(overrides: Record<string, unknown> = {}) {
  return {
    reviewThreads: { pageInfo: { hasPreviousPage: false }, nodes: [] },
    comments: { pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { pageInfo: { hasPreviousPage: false }, nodes: [] },
    ...overrides,
  };
}

function threads(...nodes: unknown[]) {
  return { reviewThreads: { pageInfo: { hasPreviousPage: false }, nodes } };
}

const thread = (id: string, comments: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  isResolved: false,
  isOutdated: false,
  viewerCanResolve: true,
  viewerCanUnresolve: false,
  path: "src/a.ts",
  line: 12,
  originalLine: 10,
  comments: { pageInfo: { hasNextPage: false }, nodes: comments },
  ...extra,
});

describe("mapPrComments", () => {
  it("returns nothing for a missing pull request", () => {
    expect(mapPrComments(null)).toEqual({ threads: [], conversation: [], truncated: false });
  });

  it("maps a review thread with its hunk tail and comments", () => {
    const first = comment(1, "2026-10-01T00:00:00Z", { diffHunk: "@@ -1,2 +1,2 @@\n a\n+b" });
    const reply = comment(2, "2026-10-02T00:00:00Z", { author: author("me") });
    const { threads: mapped } = mapPrComments(node(threads(thread("T1", [first, reply]))));
    expect(mapped).toEqual([
      {
        id: "T1",
        path: "src/a.ts",
        line: 12,
        state: "open",
        can_resolve: true,
        can_unresolve: false,
        hunk: [
          { kind: "context", line: 1, text: "a" },
          { kind: "add", line: 2, text: "b" },
        ],
        comments: [
          {
            id: 1,
            author: { login: "bob", avatar_url: "https://a/bob", is_bot: false },
            body: "comment 1",
            created_at: "2026-10-01T00:00:00Z",
            html_url: "https://github.com/o/r/pull/1#c1",
          },
          {
            id: 2,
            author: { login: "me", avatar_url: "https://a/me", is_bot: false },
            body: "comment 2",
            created_at: "2026-10-02T00:00:00Z",
            html_url: "https://github.com/o/r/pull/1#c2",
          },
        ],
        html_url: "https://github.com/o/r/pull/1#c1",
      },
    ]);
  });

  it("derives thread state, resolved winning over outdated", () => {
    const c = [comment(1, "T1")];
    const { threads: mapped } = mapPrComments(
      node(
        threads(
          thread("open", c),
          thread("resolved", c, { isResolved: true, isOutdated: true }),
          thread("outdated", c, { isOutdated: true }),
        ),
      ),
    );
    expect(mapped.map((t) => [t.id, t.state])).toEqual([
      ["open", "open"],
      ["resolved", "resolved"],
      ["outdated", "outdated"],
    ]);
  });

  it("falls back to the original line, then null", () => {
    const c = [comment(1, "T1")];
    const { threads: mapped } = mapPrComments(
      node(
        threads(thread("a", c, { line: null }), thread("b", c, { line: null, originalLine: null })),
      ),
    );
    expect(mapped.map((t) => t.line)).toEqual([10, null]);
  });

  it("skips empty threads and orders threads by their first comment", () => {
    const { threads: mapped } = mapPrComments(
      node(
        threads(
          thread("late", [comment(1, "2026-10-03T00:00:00Z")]),
          thread("empty", []),
          thread("early", [comment(2, "2026-10-01T00:00:00Z")]),
        ),
      ),
    );
    expect(mapped.map((t) => t.id)).toEqual(["early", "late"]);
  });

  it("merges issue comments and review summaries, oldest first", () => {
    const { conversation } = mapPrComments(
      node({
        comments: {
          pageInfo: { hasPreviousPage: false },
          nodes: [comment(1, "2026-10-03T00:00:00Z"), comment(2, "2026-10-01T00:00:00Z")],
        },
        reviews: {
          pageInfo: { hasPreviousPage: false },
          nodes: [review(9, "APPROVED", "LGTM", "2026-10-02T00:00:00Z")],
        },
      }),
    );
    expect(conversation).toEqual([
      {
        kind: "comment",
        id: "c2",
        author: { login: "bob", avatar_url: "https://a/bob", is_bot: false },
        body: "comment 2",
        created_at: "2026-10-01T00:00:00Z",
        html_url: "https://github.com/o/r/pull/1#c2",
      },
      {
        kind: "review",
        id: "r9",
        author: { login: "carol", avatar_url: "https://a/carol", is_bot: false },
        body: "LGTM",
        created_at: "2026-10-02T00:00:00Z",
        html_url: "https://github.com/o/r/pull/1#r9",
        verdict: "APPROVED",
      },
      expect.objectContaining({ kind: "comment", id: "c1" }),
    ]);
  });

  it("keeps verdicts and commented reviews with a body, dropping the rest", () => {
    const { conversation } = mapPrComments(
      node({
        reviews: {
          pageInfo: { hasPreviousPage: false },
          nodes: [
            review(1, "APPROVED"),
            review(2, "CHANGES_REQUESTED"),
            review(3, "DISMISSED"),
            review(4, "COMMENTED", "a note"),
            review(5, "COMMENTED", "  \n"),
            review(6, "PENDING", "draft"),
            review(7, "APPROVED", "", null),
          ],
        },
      }),
    );
    expect(conversation.map((c) => c.id)).toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("maps deleted accounts to ghost and flags bots", () => {
    const { conversation } = mapPrComments(
      node({
        comments: {
          pageInfo: { hasPreviousPage: false },
          nodes: [
            comment(1, "T1", { author: null }),
            comment(2, "T2", { author: author("codecov", "Bot") }),
            comment(3, "T3", { author: author("renovate[bot]") }),
            comment(4, "T4", { author: { __typename: "User", login: "", avatarUrl: "" } }),
          ],
        },
      }),
    );
    expect(conversation.map((c) => c.author)).toEqual([
      { login: "ghost", avatar_url: "https://github.com/ghost.png", is_bot: false },
      { login: "codecov", avatar_url: "https://a/codecov", is_bot: true },
      { login: "renovate[bot]", avatar_url: "https://a/renovate[bot]", is_bot: true },
      { login: "", avatar_url: "", is_bot: false },
    ]);
  });

  it.each(["reviewThreads", "comments", "reviews"])(
    "flags truncation when %s has older items",
    (field) => {
      const raw = node({ [field]: { pageInfo: { hasPreviousPage: true }, nodes: [] } });
      expect(mapPrComments(raw).truncated).toBe(true);
    },
  );

  it("flags truncation when a thread has more comments", () => {
    const long = thread("T1", [comment(1, "T1")], {
      comments: { pageInfo: { hasNextPage: true }, nodes: [comment(1, "T1")] },
    });
    expect(mapPrComments(node()).truncated).toBe(false);
    expect(mapPrComments(node(threads(long))).truncated).toBe(true);
  });
});

describe("threadStatus", () => {
  it("lets resolved win over outdated, and reads the viewer's actions", () => {
    expect(
      threadStatus({
        isResolved: true,
        isOutdated: true,
        viewerCanResolve: false,
        viewerCanUnresolve: true,
      }),
    ).toEqual({ state: "resolved", can_resolve: false, can_unresolve: true });
    expect(threadStatus({ isResolved: false, isOutdated: true })).toEqual({
      state: "outdated",
      can_resolve: false,
      can_unresolve: false,
    });
  });
});

describe("withThreadStatus", () => {
  it("changes only the named thread", () => {
    const t = (id: string) => ({
      id,
      path: "a.ts",
      line: 1,
      state: "open" as const,
      hunk: [],
      comments: [],
      html_url: "",
      can_resolve: true,
      can_unresolve: false,
    });
    const before = { threads: [t("A"), t("B")], conversation: [], truncated: false };
    const after = withThreadStatus(before, "B", { state: "resolved" });
    expect(after.threads.map((x) => x.state)).toEqual(["open", "resolved"]);
    expect(before.threads[1].state).toBe("open");
  });
});
