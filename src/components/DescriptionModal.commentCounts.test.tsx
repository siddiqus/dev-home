import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DescriptionModal } from "./DescriptionModal";
import { PRCard } from "./PRCard";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import { fetchPRComments } from "../services/github";
import { COMMENTS_READ_KEY, commentsReadAt } from "../services/commentsRead";
import type { GitHubPR, PRComments } from "../types";

// The row chip, the tab label and the tab's tags, end to end: the real counts,
// read-marker store and comments hook, with only GitHub's fetch mocked.

vi.mock("./Markdown", () => ({
  Markdown: ({ children }: { children: string }) => <div className="markdown-body">{children}</div>,
}));
vi.mock("./PrNotesPanel", () => ({ PrNotesPanel: () => null }));
vi.mock("../services/github", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/github")>()),
  fetchPRComments: vi.fn(),
}));

const DAY = 86_400_000;
const HOUR = 3_600_000;

beforeEach(() => {
  localStorage.clear();
  // The store's start time, which a never-opened PR reads as.
  localStorage.setItem(
    COMMENTS_READ_KEY,
    JSON.stringify({ since: new Date(Date.now() - 3 * DAY).toISOString(), read: {} }),
  );
});

const author = (login: string, is_bot = false) => ({ login, avatar_url: "", is_bot });

describe("comment counts across the row, the tab label and the tab", () => {
  it("agree on what's new, and opening the tab clears it everywhere", async () => {
    const pr = {
      id: 77,
      number: 77,
      title: "Retry uploads",
      html_url: "https://github.com/o/r/pull/77",
      state: "open",
      draft: false,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-02T00:00:00Z",
      user: { login: "me", avatar_url: "" },
      head: { ref: "feature" },
      base: { ref: "main" },
      repo_full_name: "o/r",
      checks_status: null,
      checks: [],
      review_status: null,
    } as GitHubPR;
    // Comments relative to the marker, so the test holds whatever the store's start.
    const marker = new Date(commentsReadAt(pr)).getTime();
    const at = (offset: number) => new Date(marker + offset).toISOString();

    // An old one, mine, a bot's, and two by others since the marker: a thread
    // reply (bob) and a conversation comment (alice).
    const comments: PRComments = {
      threads: [
        {
          id: "t1",
          path: "src/upload.ts",
          line: 3,
          state: "open",
          hunk: [],
          comments: [
            {
              id: 1,
              author: author("alice"),
              body: "Old point",
              created_at: at(-DAY),
              html_url: "https://github.com/o/r/pull/77#discussion_r1",
            },
            {
              id: 2,
              author: author("bob"),
              body: "Thread reply",
              created_at: at(2 * HOUR),
              html_url: "https://github.com/o/r/pull/77#discussion_r2",
            },
          ],
          html_url: "https://github.com/o/r/pull/77#discussion_r1",
          can_resolve: false,
          can_unresolve: false,
        },
      ],
      conversation: [
        {
          kind: "comment",
          id: "c1",
          author: author("codecov[bot]", true),
          body: "Coverage 91%",
          created_at: at(HOUR),
          html_url: "https://github.com/o/r/pull/77#issuecomment-1",
        },
        {
          kind: "comment",
          id: "c2",
          author: author("me"),
          body: "Pushed a fix",
          created_at: at(HOUR),
          html_url: "https://github.com/o/r/pull/77#issuecomment-2",
        },
        {
          kind: "comment",
          id: "c3",
          author: author("alice"),
          body: "Conversation comment",
          created_at: at(3 * HOUR),
          html_url: "https://github.com/o/r/pull/77#issuecomment-3",
        },
      ],
      truncated: false,
    };
    // The list's view of the same comments: GitHub's total, bots included, and
    // the recent non-bot ones.
    const listed: GitHubPR = {
      ...pr,
      comment_count: 5,
      recent_comments: [
        { at: at(-DAY), by: "alice" },
        { at: at(HOUR), by: "me" },
        { at: at(2 * HOUR), by: "bob" },
        { at: at(3 * HOUR), by: "alice" },
      ],
    };
    vi.mocked(fetchPRComments).mockResolvedValue(comments);

    const view = (show: boolean) => (
      <ViewerLoginContext.Provider value="me">
        <PRCard
          pr={listed}
          fields={{
            showAuthor: true,
            showBranch: false,
            showStatus: false,
            showChecks: false,
            timestamps: "open",
          }}
          onOpen={() => {}}
        />
        <DescriptionModal show={show} onHide={() => {}} title="" description="" pr={listed} />
      </ViewerLoginContext.Provider>
    );
    const chip = () => document.querySelector(".comment-count-chip");
    const newPills = () => screen.queryAllByText("New", { selector: ".comment-new-pill" });

    const { rerender } = render(view(true));
    expect(chip()).toHaveTextContent("5 · 2 new");
    fireEvent.click(screen.getByRole("button", { name: "Comments 5 · 2 new" }));

    // Loaded: the two are tagged and summed up, as the label counted them...
    expect(await screen.findByText("Conversation comment")).toBeInTheDocument();
    expect(newPills()).toHaveLength(2);
    expect(screen.getByText(/since you last looked/).parentElement).toHaveTextContent(
      "2 new since you last looked",
    );
    // ...and marked read, so the label and the row drop "new".
    expect(screen.getByRole("button", { name: "Comments 5" })).toBeInTheDocument();
    expect(chip()).toHaveTextContent(/^5$/);

    // Reopened: nothing's new.
    rerender(view(false));
    rerender(view(true));
    fireEvent.click(screen.getByRole("button", { name: "Comments 5" }));
    expect(screen.getByText("Conversation comment")).toBeInTheDocument();
    expect(newPills()).toHaveLength(0);
    expect(screen.queryByText(/since you last looked/)).toBeNull();
  });
});
