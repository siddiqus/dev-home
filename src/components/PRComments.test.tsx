import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PRComments } from "./PRComments";
import { formatFeedbackForClaude } from "../utils/prFeedback";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import type {
  GitHubPR,
  PRComments as PRCommentsData,
  PRConversationItem,
  PRReviewThread,
  PRThreadComment,
} from "../types";

// The real renderer loads lazily; plain text keeps these tests synchronous.
vi.mock("./Markdown", () => ({
  Markdown: ({ children }: { children: string }) => <div className="markdown-body">{children}</div>,
}));

const pr: GitHubPR = {
  id: 1,
  number: 42,
  title: "Retry uploads",
  html_url: "https://github.com/o/r/pull/42",
  state: "open",
  draft: false,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  user: { login: "sabbir", avatar_url: "" },
  head: { ref: "feature" },
  base: { ref: "main" },
  repo_full_name: "o/r",
  checks_status: null,
  checks: [],
  review_status: null,
};

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const author = (login: string, is_bot = false) => ({ login, avatar_url: "", is_bot });

let seq = 0;
function comment(login: string, body: string, days = 2): PRThreadComment {
  seq += 1;
  return {
    id: seq,
    author: author(login),
    body,
    created_at: daysAgo(days),
    html_url: `https://github.com/o/r/pull/42#discussion_r${seq}`,
  };
}

function thread(o: Partial<PRReviewThread> & Pick<PRReviewThread, "id">): PRReviewThread {
  return {
    path: "src/upload/s3_client.py",
    line: 88,
    state: "open",
    hunk: [],
    comments: [comment("alice-chen", "Looks off.")],
    html_url: `https://github.com/o/r/pull/42#thread-${o.id}`,
    can_resolve: true,
    can_unresolve: false,
    ...o,
  };
}

function item(
  login: string,
  body: string,
  o: Partial<PRConversationItem> & { is_bot?: boolean } = {},
): PRConversationItem {
  const { is_bot = false, ...rest } = o;
  return {
    kind: "comment",
    id: `${login}-${body}`,
    author: author(login, is_bot),
    body,
    created_at: daysAgo(1),
    html_url: `https://github.com/o/r/pull/42#issuecomment-${login}`,
    ...rest,
  };
}

const data = (o: Partial<PRCommentsData> = {}): PRCommentsData => ({
  threads: [],
  conversation: [],
  truncated: false,
  ...o,
});

const sample = data({
  threads: [
    thread({
      id: "t1",
      hunk: [
        { kind: "context", line: 86, text: "    try:" },
        { kind: "del", line: 87, text: "        pass" },
        { kind: "add", line: 88, text: "    except ClientError as err:" },
      ],
      comments: [comment("alice-chen", "Only retry SlowDown."), comment("sabbir", "Will do.", 1)],
    }),
    thread({
      id: "t2",
      path: "src/config.py",
      line: 12,
      state: "resolved",
      comments: [
        comment("marko-p", "MAX_RETRIES should come from settings\nand be documented"),
        comment("sabbir", "Done."),
      ],
    }),
    thread({ id: "t3", path: "tests/test_s3_client.py", line: 41 }),
    thread({ id: "t4", line: 101, comments: [comment("marko-p", "No jitter.")] }),
    thread({
      id: "t5",
      line: 70,
      state: "outdated",
      hunk: [{ kind: "context", line: 70, text: "import os" }],
      comments: [comment("alice-chen", "Unused import")],
    }),
  ],
  conversation: [
    item("marko-p", "Approach looks right.", { kind: "review", verdict: "COMMENTED" }),
    item("sonarcloud[bot]", "Quality gate passed", { is_bot: true }),
    item("alice-chen", "Retry scope is too broad.", {
      kind: "review",
      verdict: "CHANGES_REQUESTED",
    }),
    item("bob", "", { kind: "review", verdict: "APPROVED" }),
    item("codecov", "Coverage 91%", { is_bot: true }),
    item("sabbir", "Pushed a fix."),
  ],
});

function renderComments(
  props: Partial<React.ComponentProps<typeof PRComments>> = {},
): ReturnType<typeof render> {
  return render(
    <PRComments
      pr={pr}
      comments={sample}
      loading={false}
      error={false}
      layout="desktop"
      {...props}
    />,
  );
}

const fileGroups = () =>
  Array.from(document.querySelectorAll(".pr-comments-file-name")).map((el) => el.textContent);

describe("PRComments", () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  it("shows a spinner while loading", () => {
    renderComments({ comments: null, loading: true });
    expect(screen.getByText("Loading comments…")).toBeInTheDocument();
  });

  it("says so when loading failed and links to GitHub", () => {
    renderComments({ comments: null, error: true });
    expect(screen.getByText("Couldn't load comments.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute(
      "href",
      pr.html_url,
    );
  });

  it("counts unresolved (as open), resolved and conversation items in the toolbar", () => {
    renderComments();
    expect(screen.getByText("4 open · 1 resolved · 6 in conversation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy open feedback" })).toBeEnabled();
  });

  it("groups unresolved threads, outdated included, by file in order of first appearance", () => {
    renderComments();
    expect(fileGroups()).toEqual(["src/upload/s3_client.py", "tests/test_s3_client.py"]);
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".pr-thread"));
    expect(cards.map((c) => c.querySelector(".pr-thread-loc")?.textContent)).toEqual([
      "line 88",
      "line 101",
      "line 70",
      "line 41",
    ]);
    // Only the outdated one is tagged.
    expect(within(cards[2]).getByText("Outdated")).toBeInTheDocument();
    expect(within(cards[2]).getByText("import os")).toBeInTheDocument();
    expect(document.querySelectorAll(".pr-thread-tag")).toHaveLength(1);
  });

  it("renders a thread's header, hunk and comments", () => {
    renderComments();
    const card = document.querySelector(".pr-thread") as HTMLElement;
    expect(within(card).getByRole("link", { name: "Open on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/o/r/pull/42#thread-t1",
    );
    expect(within(card).getByRole("button", { name: "Copy thread" })).toBeInTheDocument();

    const rows = card.querySelectorAll(".pr-hunk-line");
    expect(Array.from(rows).map((r) => r.textContent)).toEqual([
      "86     try:",
      "87-        pass",
      "88+    except ClientError as err:",
    ]);
    expect(rows[1]).toHaveClass("pr-hunk-line--del");
    expect(rows[2]).toHaveClass("pr-hunk-line--add", "is-commented");
    expect(rows[0]).not.toHaveClass("is-commented");

    expect(within(card).getByText("alice-chen")).toBeInTheDocument();
    expect(within(card).getByText("Only retry SlowDown.")).toBeInTheDocument();
    expect(within(card).getByText("Will do.")).toBeInTheDocument();
    expect(within(card).getByText("2d ago")).toBeInTheDocument();
  });

  it("labels a file-level thread and skips an empty hunk", () => {
    renderComments({ comments: data({ threads: [thread({ id: "t1", line: null })] }) });
    const card = document.querySelector(".pr-thread") as HTMLElement;
    expect(within(card).getByText("file")).toBeInTheDocument();
    expect(card.querySelector("pre")).toBeNull();
  });

  it("disables the copy button and says so when nothing is open", () => {
    renderComments({ comments: data({ threads: [thread({ id: "t1", state: "resolved" })] }) });
    expect(screen.getByText("No open threads")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy open feedback" })).toBeDisabled();
  });

  it("counts an outdated thread as open", async () => {
    renderComments({ comments: data({ threads: [thread({ id: "t1", state: "outdated" })] }) });
    expect(screen.queryByText("No open threads")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy open feedback" }));
    expect(await screen.findByText("Copied 1 open thread")).toBeInTheDocument();
  });

  it("folds resolved threads into one-liners that expand", () => {
    renderComments();
    const fold = screen.getByRole("button", { name: /^1 resolved$/ });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("config.py:12")).toBeNull();

    fireEvent.click(fold);
    expect(fold).toHaveAttribute("aria-expanded", "true");
    const resolved = screen.getByText("config.py:12").closest("button") as HTMLElement;
    expect(
      within(resolved).getByText("marko-p: MAX_RETRIES should come from settings"),
    ).toBeInTheDocument();
    expect(within(resolved).getByText("· 2 comments")).toBeInTheDocument();

    expect(screen.queryByText("Done.")).toBeNull();
    fireEvent.click(resolved);
    expect(resolved).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelectorAll(".pr-thread")).toHaveLength(5);
    expect(screen.getByText("Done.")).toBeInTheDocument();
    fireEvent.click(resolved);
    expect(document.querySelectorAll(".pr-thread")).toHaveLength(4);
  });

  it("previews a bare suggestion in words, not markdown", () => {
    const suggestion = comment("alice-chen", "```suggestion\nreturn x\n```");
    renderComments({
      comments: data({
        threads: [thread({ id: "t1", state: "resolved", comments: [suggestion] })],
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: /1 resolved/ }));
    expect(screen.getByText("alice-chen: suggested a change")).toBeInTheDocument();
    expect(screen.getByText("· 1 comment")).toBeInTheDocument();
  });

  it("lists the conversation oldest first, with verdicts and links", () => {
    renderComments();
    const items = Array.from(document.querySelectorAll<HTMLElement>(".pr-convo-item"));
    expect(items.map((el) => el.querySelector(".pr-comments-who")?.textContent)).toEqual([
      "marko-p",
      "alice-chen",
      "bob",
      "sabbir",
    ]);
    expect(within(items[0]).getByText("Commented")).toBeInTheDocument();
    expect(within(items[1]).getByText("Changes requested")).toBeInTheDocument();
    expect(within(items[2]).getByText("Approved")).toBeInTheDocument();
    // A verdict-only review has no body.
    expect(items[2].querySelector(".markdown-body")).toBeNull();
    expect(within(items[3]).getByRole("link", { name: "1d ago" })).toHaveAttribute(
      "href",
      "https://github.com/o/r/pull/42#issuecomment-sabbir",
    );
  });

  it("folds bot comments behind a toggle", () => {
    renderComments();
    expect(screen.queryByText("Quality gate passed")).toBeNull();
    const toggle = screen.getByRole("button", { name: /2 bot comments · sonarcloud, codecov/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Quality gate passed")).toBeInTheDocument();
    expect(screen.getByText("Coverage 91%")).toBeInTheDocument();
  });

  it("says when there's no conversation", () => {
    renderComments({ comments: data() });
    expect(screen.getByText("No comments yet")).toBeInTheDocument();
  });

  it("notes that some comments are only on GitHub", () => {
    renderComments({ comments: data({ truncated: true }) });
    expect(screen.getByText(/Some comments weren't fetched/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See them all on GitHub" })).toHaveAttribute(
      "href",
      pr.html_url,
    );
  });

  it("copies the open feedback and confirms with a toast", async () => {
    renderComments();
    fireEvent.click(screen.getByRole("button", { name: "Copy open feedback" }));
    expect(writeText).toHaveBeenCalledWith(formatFeedbackForClaude(pr, sample));
    expect(await screen.findByText("Copied 4 open threads")).toBeInTheDocument();
  });

  it("says thread in the singular when one is open", async () => {
    renderComments({ comments: data({ threads: [thread({ id: "t1" })] }) });
    fireEvent.click(screen.getByRole("button", { name: "Copy open feedback" }));
    expect(await screen.findByText("Copied 1 open thread")).toBeInTheDocument();
  });

  it("copies a single thread", async () => {
    renderComments();
    const card = document.querySelectorAll(".pr-thread")[1] as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Copy thread" }));
    expect(writeText).toHaveBeenCalledWith(formatFeedbackForClaude(pr, sample, "t4"));
    expect(await screen.findByText("Copied thread")).toBeInTheDocument();
  });

  describe("on a phone", () => {
    it("renders the two parts as phone sections, with Copy in the feedback header", () => {
      renderComments({ layout: "phone" });
      const sections = document.querySelectorAll("section.modal-phone-section");
      expect(sections).toHaveLength(2);
      const [feedback, conversation] = Array.from(sections) as HTMLElement[];

      const header = feedback.querySelector(".modal-body-section-header") as HTMLElement;
      expect(header).toHaveTextContent("Code feedback");
      expect(within(header).getByRole("button", { name: "Copy open feedback" })).toBeEnabled();
      expect(within(feedback).getAllByText("line 88").length).toBe(1);

      expect(conversation.querySelector(".modal-body-section-header")).toHaveTextContent(
        "Conversation",
      );
      expect(within(conversation).getByText("Pushed a fix.")).toBeInTheDocument();
      // No desktop toolbar.
      expect(screen.queryByText(/in conversation/)).toBeNull();
    });

    it("keeps the spinner inside a phone section", () => {
      renderComments({ layout: "phone", comments: null, loading: true });
      const section = document.querySelector("section.modal-phone-section") as HTMLElement;
      expect(within(section).getByText("Loading comments…")).toBeInTheDocument();
    });
  });
});

describe("PRComments resolving", () => {
  const one = (o: Partial<PRReviewThread> = {}) => data({ threads: [thread({ id: "t1", ...o })] });

  it("offers Resolve only with a writer and GitHub's permission", () => {
    const { unmount } = renderComments({ comments: one() });
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
    unmount();
    renderComments({ comments: one({ can_resolve: false }), setThreadResolved: vi.fn() });
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
  });

  it("resolves in one click, with Undo in the toast", () => {
    const setThreadResolved = vi.fn().mockResolvedValue(undefined);
    renderComments({ comments: one(), setThreadResolved });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(setThreadResolved).toHaveBeenCalledWith("t1", true);
    expect(screen.getByText("Resolved thread")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(setThreadResolved).toHaveBeenLastCalledWith("t1", false);
  });

  it("unresolves an expanded resolved thread", () => {
    const setThreadResolved = vi.fn().mockResolvedValue(undefined);
    renderComments({
      comments: one({ state: "resolved", can_resolve: false, can_unresolve: true }),
      setThreadResolved,
    });
    fireEvent.click(screen.getByRole("button", { name: /1 resolved/ }));
    fireEvent.click(screen.getByRole("button", { name: /s3_client\.py:88/ }));
    fireEvent.click(screen.getByRole("button", { name: "Unresolve" }));
    expect(setThreadResolved).toHaveBeenCalledWith("t1", false);
    expect(screen.getByText("Unresolved thread")).toBeInTheDocument();
  });

  it("says so when GitHub refuses", async () => {
    const setThreadResolved = vi.fn().mockRejectedValue(new Error("nope"));
    renderComments({ comments: one(), setThreadResolved });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(await screen.findByText("Couldn't resolve the thread")).toBeInTheDocument();
  });
});

describe("PRComments unread since the last look", () => {
  const READ_SINCE = daysAgo(3);
  const at = (login: string, body: string, days: number, is_bot = false): PRThreadComment => ({
    ...comment(login, body, days),
    author: author(login, is_bot),
  });
  // New: marko's reply on t1, alice's reply on resolved t3, and two conversation
  // comments. Not: old ones, mine, the bot's, and bob's review summary (the
  // counts leave summaries out).
  const unreadSample = data({
    threads: [
      thread({
        id: "t1",
        comments: [
          at("alice-chen", "Only retry SlowDown.", 5),
          at("marko-p", "Agreed, and add jitter.", 1),
          at("sabbir", "Will do.", 1),
        ],
      }),
      thread({ id: "t2", line: 12, comments: [at("alice-chen", "Nit.", 5)] }),
      thread({
        id: "t3",
        path: "src/config.py",
        state: "resolved",
        comments: [at("marko-p", "Use settings.", 5), at("alice-chen", "Still wrong.", 1)],
      }),
    ],
    conversation: [
      item("marko-p", "Approach looks right.", {
        kind: "review",
        verdict: "COMMENTED",
        created_at: daysAgo(5),
      }),
      item("alice-chen", "Retry scope is too broad."),
      item("sabbir", "Pushed a fix."),
      item("codecov", "Coverage 91%", { is_bot: true }),
      item("bob", "LGTM", { kind: "review", verdict: "APPROVED" }),
      item("marko-p", "Happy to approve.", { created_at: daysAgo(0.2) }),
    ],
  });

  function renderUnread(props: Partial<React.ComponentProps<typeof PRComments>> = {}) {
    return render(
      <ViewerLoginContext.Provider value="sabbir">
        <PRComments
          pr={pr}
          comments={unreadSample}
          loading={false}
          error={false}
          layout="desktop"
          readSince={READ_SINCE}
          {...props}
        />
      </ViewerLoginContext.Provider>,
    );
  }

  const whoIsNew = (root: ParentNode, selector: string) =>
    [...root.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => el.querySelector(".comment-new-pill"))
      .map((el) => el.querySelector(".pr-comments-who")?.textContent);
  const summary = () => document.querySelector(".pr-comments-summary-new");

  it("sums up everything new at the top, above the code feedback", () => {
    renderUnread();
    expect(summary()).toHaveTextContent("4 new since you last looked");
    expect(summary()?.compareDocumentPosition(screen.getByText("Code feedback"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("says the sum is a lower bound when some comments weren't fetched", () => {
    renderUnread({ comments: { ...unreadSample, truncated: true } });
    expect(summary()).toHaveTextContent("4+ new since you last looked");
  });

  it("tags thread comments from others since the last look, and counts them on the card", () => {
    renderUnread();
    const [t1, t2] = Array.from(document.querySelectorAll<HTMLElement>(".pr-thread"));
    expect(whoIsNew(t1, ".pr-thread-comment")).toEqual(["marko-p"]);
    expect(
      within(t1.querySelector(".pr-thread-header") as HTMLElement).getByText("1 new"),
    ).toHaveClass("comment-new-pill");
    expect(t2.querySelector(".comment-new-pill")).toBeNull();
  });

  it("tags new conversation comments, leading them with a New divider", () => {
    renderUnread();
    expect(whoIsNew(document, ".pr-convo-item")).toEqual(["alice-chen", "marko-p"]);
    const dividers = document.querySelectorAll(".pr-comments-since");
    expect(dividers).toHaveLength(1);
    expect(dividers[0]).toHaveTextContent(/^New$/);
    expect(dividers[0].nextElementSibling?.querySelector(".pr-comments-who")).toHaveTextContent(
      "alice-chen",
    );
  });

  it("sums up a new thread reply with no divider when the conversation has nothing new", () => {
    renderUnread({
      comments: data({
        threads: [thread({ id: "t1", comments: [at("marko-p", "Add jitter.", 1)] })],
        conversation: [item("alice-chen", "Looks good.", { created_at: daysAgo(5) })],
      }),
    });
    expect(summary()).toHaveTextContent("1 new since you last looked");
    expect(document.querySelector(".pr-comments-since")).toBeNull();
  });

  it("points out a new reply hidden in a resolved thread", () => {
    renderUnread();
    const fold = screen.getByRole("button", { name: /^1 resolved/ });
    expect(within(fold).getByText("1 new")).toHaveClass("comment-new-pill");
    fireEvent.click(fold);
    const oneLine = screen.getByText("config.py:88").closest("button") as HTMLElement;
    expect(within(oneLine).getByText("1 new")).toBeInTheDocument();
    fireEvent.click(oneLine);
    const card = oneLine.parentElement!.querySelector(".pr-thread") as HTMLElement;
    expect(whoIsNew(card, ".pr-thread-comment")).toEqual(["alice-chen"]);
  });

  it("tags nothing without a last look", () => {
    renderUnread({ readSince: null });
    expect(document.querySelector(".comment-new-pill")).toBeNull();
    expect(document.querySelector(".pr-comments-since")).toBeNull();
    expect(summary()).toBeNull();
  });

  it("shows no sum or tags when nothing is new", () => {
    renderUnread({ readSince: daysAgo(0.1) });
    expect(summary()).toBeNull();
    expect(document.querySelector(".pr-comments-since")).toBeNull();
    expect(document.querySelector(".comment-new-pill")).toBeNull();
  });

  it("puts the sum at the top of the first phone section, and tags the same way", () => {
    renderUnread({ layout: "phone", comments: { ...unreadSample, truncated: true } });
    const first = document.querySelector("section.modal-phone-section") as HTMLElement;
    expect(first.firstElementChild).toBe(summary());
    expect(summary()).toHaveTextContent("4+ new since you last looked");
    expect(whoIsNew(document, ".pr-convo-item")).toEqual(["alice-chen", "marko-p"]);
  });
});
