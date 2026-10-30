import { describe, it, expect } from "vitest";
import type {
  GitHubPR,
  PRComments,
  PRConversationItem,
  PRReviewThread,
  PRThreadComment,
} from "../types";
import { formatFeedbackForClaude, previewLine } from "./prFeedback";

const pr = {
  id: 1,
  number: 1287,
  title: "CMP-4821 Retry asset uploads on S3 throttling",
  html_url: "https://github.com/newscred/cmp-assets/pull/1287",
  state: "open",
  draft: false,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  user: { login: "sabbir", avatar_url: "" },
  head: { ref: "CMP-4821-upload-retry" },
  base: { ref: "master" },
  repo_full_name: "newscred/cmp-assets",
  checks_status: null,
  checks: [],
  review_status: null,
} satisfies GitHubPR;

const author = (login: string, is_bot = false) => ({ login, avatar_url: "", is_bot });

function comment(login: string, body: string): PRThreadComment {
  return {
    id: Math.floor(Math.random() * 1e9),
    author: author(login),
    body,
    created_at: "2026-10-01T00:00:00Z",
    html_url: "https://github.com/c",
  };
}

function thread(o: Partial<PRReviewThread> & Pick<PRReviewThread, "id">): PRReviewThread {
  return {
    path: "assets/upload/s3_client.py",
    line: 88,
    state: "open",
    hunk: [],
    comments: [comment("alice-chen", "Looks off.")],
    html_url: "https://github.com/t",
    can_resolve: true,
    can_unresolve: false,
    ...o,
  };
}

function review(
  login: string,
  verdict: PRConversationItem["verdict"],
  body: string,
  is_bot = false,
): PRConversationItem {
  return {
    kind: "review",
    id: `r-${login}-${body.length}`,
    author: author(login, is_bot),
    body,
    created_at: "2026-10-01T00:00:00Z",
    html_url: "https://github.com/r",
    verdict,
  };
}

const data = (o: Partial<PRComments> = {}): PRComments => ({
  threads: [],
  conversation: [],
  truncated: false,
  ...o,
});

describe("formatFeedbackForClaude", () => {
  it("formats every unresolved thread with its hunk, then the review summaries", () => {
    const comments = data({
      threads: [
        thread({
          id: "t1",
          hunk: [
            { kind: "context", line: 86, text: "    try:" },
            { kind: "del", line: 87, text: "        pass" },
            { kind: "add", line: 88, text: "    except ClientError as err:" },
          ],
          comments: [
            comment(
              "alice-chen",
              "This catches every `ClientError`. Retrying\nthose just delays the failure.",
            ),
            comment("sabbir", "Good point, will narrow it."),
          ],
        }),
        thread({ id: "t2", state: "resolved", path: "config.py", line: 12 }),
        thread({
          id: "t3",
          path: "tests/test_s3_client.py",
          line: 41,
          hunk: [{ kind: "add", line: 41, text: "    assert calls == 3" }],
          comments: [comment("marko-p", "Test the non-retryable path too?")],
        }),
        thread({ id: "t4", state: "outdated", line: 70 }),
      ],
      conversation: [
        review("marko-p", "COMMENTED", "Approach looks right."),
        review("alice-chen", "CHANGES_REQUESTED", "Retry scope is too broad."),
        review("bob", "APPROVED", "   "),
        review("sonarcloud", "COMMENTED", "Quality gate passed", true),
        {
          kind: "comment",
          id: "c1",
          author: author("sabbir"),
          body: "Pushed a fix.",
          created_at: "2026-10-01T00:00:00Z",
          html_url: "https://github.com/c1",
        },
      ],
    });

    expect(formatFeedbackForClaude(pr, comments)).toBe(
      [
        "Address the open review feedback on newscred/cmp-assets#1287",
        '"CMP-4821 Retry asset uploads on S3 throttling"',
        "Branch: CMP-4821-upload-retry → master",
        "https://github.com/newscred/cmp-assets/pull/1287",
        "",
        "3 open review threads:",
        "",
        "## assets/upload/s3_client.py:88",
        "```diff",
        "     try:",
        "-        pass",
        "+    except ClientError as err:",
        "```",
        "- alice-chen:",
        "  This catches every `ClientError`. Retrying",
        "  those just delays the failure.",
        "- sabbir: Good point, will narrow it.",
        "",
        "## tests/test_s3_client.py:41",
        "```diff",
        "+    assert calls == 3",
        "```",
        "- marko-p: Test the non-retryable path too?",
        "",
        "## assets/upload/s3_client.py:70 (outdated)",
        "- alice-chen: Looks off.",
        "",
        "Review summaries:",
        "- marko-p (commented): Approach looks right.",
        "- alice-chen (changes requested): Retry scope is too broad.",
      ].join("\n"),
    );
  });

  it("copies a single thread in any state, without the review summaries", () => {
    const comments = data({
      threads: [
        thread({ id: "t1" }),
        thread({
          id: "t2",
          state: "resolved",
          path: "config.py",
          line: 12,
          comments: [comment("marko-p", "MAX_RETRIES should come from settings")],
        }),
      ],
      conversation: [review("alice-chen", "CHANGES_REQUESTED", "Too broad.")],
    });

    expect(formatFeedbackForClaude(pr, comments, "t2")).toBe(
      [
        "Address this review comment on newscred/cmp-assets#1287",
        '"CMP-4821 Retry asset uploads on S3 throttling"',
        "Branch: CMP-4821-upload-retry → master",
        "https://github.com/newscred/cmp-assets/pull/1287",
        "",
        "## config.py:12",
        "- marko-p: MAX_RETRIES should come from settings",
      ].join("\n"),
    );
  });

  it("says thread in the singular and uses the bare path for a file-level thread", () => {
    const text = formatFeedbackForClaude(
      pr,
      data({ threads: [thread({ id: "t1", path: "README.md", line: null })] }),
    );
    expect(text).toContain("\n1 open review thread:\n");
    expect(text).toContain("\n## README.md\n- alice-chen: Looks off.");
    expect(text).not.toContain("```diff");
    expect(text).not.toContain("Review summaries:");
  });

  it("puts a multi-line body under the author, verbatim but indented", () => {
    const body = "nit:\r\n\r\n```suggestion\n    return x\n```";
    const text = formatFeedbackForClaude(
      pr,
      data({ threads: [thread({ id: "t1", comments: [comment("alice-chen", body)] })] }),
    );
    expect(text).toContain(
      ["- alice-chen:", "  nit:", "", "  ```suggestion", "      return x", "  ```"].join("\n"),
    );
  });

  it("never opens a fence on the author's line", () => {
    // A GitHub suggestion, as posted: the body starts with the fence.
    const suggestion = "```suggestion\nreturn x\n```";
    const text = formatFeedbackForClaude(
      pr,
      data({
        threads: [
          thread({
            id: "t1",
            comments: [comment("alice-chen", suggestion), comment("bob", "```")],
          }),
        ],
      }),
    );
    expect(text).toContain(
      ["- alice-chen:", "  ```suggestion", "  return x", "  ```", "- bob:", "  ```"].join("\n"),
    );
  });

  it("fences a hunk with more backticks than any line in it", () => {
    const text = formatFeedbackForClaude(
      pr,
      data({
        threads: [
          thread({
            id: "t1",
            path: "README.md",
            hunk: [
              { kind: "context", line: 9, text: "```bash" },
              { kind: "add", line: 10, text: "````" },
            ],
          }),
        ],
      }),
    );
    expect(text).toContain(["`````diff", " ```bash", "+````", "`````"].join("\n"));
  });

  it("notes comments that weren't fetched", () => {
    const text = formatFeedbackForClaude(pr, data({ truncated: true }));
    expect(text.split("\n").slice(3, 6)).toEqual([
      "https://github.com/newscred/cmp-assets/pull/1287",
      "Note: this PR has more comments than were fetched; see https://github.com/newscred/cmp-assets/pull/1287",
      "",
    ]);
    expect(formatFeedbackForClaude(pr, data())).not.toContain("Note:");
  });

  it("labels every review verdict", () => {
    const text = formatFeedbackForClaude(
      pr,
      data({
        conversation: [
          review("a", "APPROVED", "ok"),
          review("b", "CHANGES_REQUESTED", "no"),
          review("c", "COMMENTED", "hm"),
          review("d", "DISMISSED", "old"),
        ],
      }),
    );
    expect(text).toContain(
      [
        "Review summaries:",
        "- a (approved): ok",
        "- b (changes requested): no",
        "- c (commented): hm",
        "- d (dismissed): old",
      ].join("\n"),
    );
  });
});

describe("previewLine", () => {
  it("takes the first prose line", () => {
    expect(previewLine("\n  Rename this.  \nMore detail")).toBe("Rename this.");
  });

  it("skips fence lines and suggested code", () => {
    expect(previewLine("```suggestion\nreturn x\n```\nCleaner this way")).toBe("Cleaner this way");
    expect(previewLine("```python\nfoo()\n```")).toBe("foo()");
  });

  it("describes a bare suggestion", () => {
    expect(previewLine("```suggestion\r\n    return x\r\n```")).toBe("suggested a change");
  });
});
