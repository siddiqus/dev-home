import { render, screen, fireEvent, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DescriptionModal } from "./DescriptionModal";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import { MergeProvider } from "../context/MergeContext";
import { usePRComments } from "../hooks/usePRComments";
import { commentCounts, loadedCommentCounts } from "../utils/commentCounts";
import { commentsReadAt, markCommentsRead, useCommentsReadAt } from "../services/commentsRead";
import type { GitHubPR, PRComments } from "../types";

// The notes column needs the Notes context; it's irrelevant to the header
// indicators under test here, so stub it out.
vi.mock("./PrNotesPanel", () => ({
  PrNotesPanel: () => <div data-testid="notes-panel" />,
}));

vi.mock("../hooks/usePRComments", () => ({ usePRComments: vi.fn() }));
const mockUsePRComments = vi.mocked(usePRComments);
const IDLE = { comments: null, loading: false, error: false, setThreadResolved: vi.fn() };

// The list counts are made up per test; the loaded ones (and the tab's tags)
// are counted for real unless a test says otherwise.
vi.mock("../utils/commentCounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/commentCounts")>();
  return {
    ...actual,
    commentCounts: vi.fn(),
    loadedCommentCounts: vi.fn(actual.loadedCommentCounts),
  };
});
vi.mock("../services/commentsRead", () => ({
  commentsReadAt: vi.fn(),
  markCommentsRead: vi.fn(),
  useCommentsReadAt: vi.fn(),
}));
const mockCounts = vi.mocked(commentCounts);
const mockLoadedCounts = vi.mocked(loadedCommentCounts);
const mockMarkRead = vi.mocked(markCommentsRead);

// A one-PR read marker: marking moves it from OLD to NEW, re-rendering its
// readers as the real store does.
const OLD_MARK = "2026-07-05T00:00:00Z";
const NEW_MARK = "2026-07-20T00:00:00Z";
let mark = OLD_MARK;
const markListeners = new Set<() => void>();
const subscribeMark = (onChange: () => void) => {
  markListeners.add(onChange);
  return () => {
    markListeners.delete(onChange);
  };
};
function useFakeReadAt(pr: unknown) {
  return useSyncExternalStore(subscribeMark, () => (pr ? mark : null));
}

beforeEach(() => {
  mockUsePRComments.mockReset();
  mockUsePRComments.mockReturnValue(IDLE);
  mark = OLD_MARK;
  vi.mocked(commentsReadAt).mockImplementation(() => mark);
  vi.mocked(useCommentsReadAt).mockImplementation(useFakeReadAt);
  mockMarkRead.mockReset();
  mockMarkRead.mockImplementation(() => {
    mark = NEW_MARK;
    markListeners.forEach((onChange) => onChange());
  });
  mockCounts.mockReset();
  mockCounts.mockReturnValue(null);
  // Back to the real count.
  mockLoadedCounts.mockReset();
});

/** The `enabled` argument of the latest usePRComments call. */
const fetchEnabled = () => mockUsePRComments.mock.calls.at(-1)?.[1];

const loadedComments: PRComments = {
  threads: [
    {
      id: "t1",
      path: "src/app.ts",
      line: 3,
      state: "open",
      hunk: [{ kind: "add", line: 3, text: "const x = 1;" }],
      comments: [
        {
          id: 1,
          author: { login: "alice", avatar_url: "", is_bot: false },
          body: "Rename x",
          created_at: "2026-07-02T00:00:00Z",
          html_url: "https://github.com/o/r/pull/42#discussion_r1",
        },
      ],
      html_url: "https://github.com/o/r/pull/42#discussion_r1",
      can_resolve: true,
      can_unresolve: false,
    },
    {
      id: "t2",
      path: "a.ts",
      line: 9,
      state: "outdated",
      hunk: [],
      comments: [],
      html_url: "",
      can_resolve: true,
      can_unresolve: false,
    },
    {
      id: "t3",
      path: "a.ts",
      line: 4,
      state: "resolved",
      hunk: [],
      comments: [],
      html_url: "",
      can_resolve: false,
      can_unresolve: true,
    },
  ],
  conversation: [],
  truncated: false,
};

/** One conversation comment from after OLD_MARK, before NEW_MARK. */
const commentsWithNew: PRComments = {
  ...loadedComments,
  conversation: [
    {
      kind: "comment",
      id: "c1",
      author: { login: "bob", avatar_url: "", is_bot: false },
      body: "Ship it?",
      created_at: "2026-07-08T00:00:00Z",
      html_url: "https://github.com/o/r/pull/42#issuecomment-1",
    },
  ],
};

function makePR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 42,
    title: "Test PR",
    html_url: "https://github.com/o/r/pull/42",
    state: "open",
    draft: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
    user: { login: "octocat", avatar_url: "" },
    head: { ref: "feature" },
    base: { ref: "main" },
    body: "Body text",
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    in_merge_queue: false,
    merged_at: undefined,
    ...overrides,
  };
}

const baseProps = {
  show: true,
  onHide: () => {},
  title: "#42 Test PR",
  description: "Body text",
};

describe("DescriptionModal PR header", () => {
  it("renders the row's indicators when a PR is provided", () => {
    render(
      <DescriptionModal
        {...baseProps}
        pr={makePR({
          review_status: "APPROVED",
          additions: 10,
          deletions: 3,
          changed_files: 2,
          labels: [{ name: "enhancement", color: "a2eeef" }],
        })}
      />,
    );

    // Status pill, branch, diff stat, labels, repo#number, author.
    expect(screen.getByText("Approved")).toHaveClass("pr-card-status");
    expect(screen.getByText("feature")).toBeInTheDocument();
    expect(screen.getByText("+10")).toBeInTheDocument();
    expect(screen.getByText("enhancement")).toHaveClass("pr-card-label");
    expect(screen.getByText("o/r#42")).toBeInTheDocument();
    expect(screen.getByText("octocat")).toBeInTheDocument();
  });

  it("turns Ready to merge into the Merge button on my own ready PR", () => {
    render(
      <ViewerLoginContext.Provider value="octocat">
        <MergeProvider>
          <DescriptionModal
            {...baseProps}
            pr={makePR({
              review_status: "APPROVED",
              checks_status: "SUCCESS",
              head: { ref: "feature", sha: "abc123" },
            })}
          />
        </MergeProvider>
      </ViewerLoginContext.Provider>,
    );

    expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
    expect(screen.queryByText("Ready to merge")).not.toBeInTheDocument();
  });

  it("shows needs-action reason chips instead of the status pill", () => {
    render(
      <DescriptionModal
        {...baseProps}
        pr={makePR({ review_status: "CHANGES_REQUESTED", unresolved_thread_count: 2 })}
      />,
    );

    expect(screen.getByText("Changes requested")).toHaveClass("pr-reason-chip");
    expect(screen.getByText("Unresolved (2)")).toHaveClass("pr-reason-chip");
    expect(document.querySelector(".pr-card-status")).toBeNull();
  });

  it("keeps the status pill and adds softer reason chips outside needs-action", () => {
    render(
      <DescriptionModal
        {...baseProps}
        pr={makePR({ requested_reviewers: [], unresolved_thread_count: 1 })}
      />,
    );

    expect(screen.getByText("Awaiting review")).toHaveClass("pr-card-status");
    expect(screen.getByText("Unresolved (1)")).toHaveClass("pr-reason-chip");
    expect(screen.getByText("No reviewer")).toHaveClass("pr-reason-chip");
  });

  it("links the Jira ticket in the title when a base URL is given", () => {
    render(
      <DescriptionModal
        {...baseProps}
        title="#7 PROJ-7: Update the widget"
        pr={makePR({ title: "PROJ-7: Update the widget" })}
        jiraBaseUrl="https://jira.example.com"
      />,
    );

    const link = screen.getByRole("link", { name: "PROJ-7" });
    expect(link).toHaveAttribute("href", "https://jira.example.com/browse/PROJ-7");
  });

  it("hides review indicators on a merged PR but keeps approved-by, merged-by and labels", () => {
    render(
      <DescriptionModal
        {...baseProps}
        pr={makePR({
          review_status: "APPROVED",
          merged_at: "2026-07-11T00:00:00Z",
          merged_by: "alice",
          approved_by: ["bob"],
          labels: [{ name: "bug", color: "d73a4a" }],
        })}
      />,
    );

    expect(document.querySelector(".pr-card-status")).toBeNull();
    expect(screen.getByText(/approved by bob/)).toBeInTheDocument();
    expect(screen.getByText(/merged by alice/)).toBeInTheDocument();
    expect(document.querySelector(".pr-modal-time")?.textContent).toMatch(/^merged /);
    expect(screen.getByText("bug")).toHaveClass("pr-card-label");
  });

  it("renders no PR indicators for a non-PR modal (e.g. a Jira issue)", () => {
    render(
      <DescriptionModal
        {...baseProps}
        title="PROJ-9: Some issue"
        subtitle="My Project"
        description="Issue body"
      />,
    );

    expect(screen.getByText("PROJ-9: Some issue")).toBeInTheDocument();
    expect(screen.getByText("My Project")).toBeInTheDocument();
    expect(document.querySelector(".pr-modal-header")).toBeNull();
    expect(document.querySelector(".pr-card-status")).toBeNull();
    expect(document.querySelector(".pr-card-branch")).toBeNull();
  });
});

describe("DescriptionModal comments tab", () => {
  it("keeps the plain Description header without a PR", () => {
    render(<DescriptionModal {...baseProps} title="PROJ-9: Some issue" />);
    expect(screen.getByText("Description")).toHaveClass("modal-body-section-header");
    expect(screen.queryByRole("button", { name: /Comments/ })).toBeNull();
  });

  it("puts Description | Comments tabs over a PR's description, without fetching", async () => {
    render(<DescriptionModal {...baseProps} pr={makePR()} />);
    expect(screen.getByRole("button", { name: "Description" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Comments" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(await screen.findByText("Body text")).toBeInTheDocument();
    expect(fetchEnabled()).toBe(false);
  });

  it("switches to the comments view and starts the fetch", () => {
    mockUsePRComments.mockReturnValue({ ...IDLE, loading: true });
    render(<DescriptionModal {...baseProps} pr={makePR()} />);
    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    expect(fetchEnabled()).toBe(true);
    expect(screen.getByText("Loading comments…")).toBeInTheDocument();
    expect(screen.queryByText("Body text")).toBeNull();
  });

  it("counts comments in the tab, from the PR until comments load", () => {
    const pr = makePR();
    mockCounts.mockReturnValue({ total: 12, unread: 3, unreadAtLeast: false });
    const modal = () => (
      <ViewerLoginContext.Provider value="me">
        <DescriptionModal {...baseProps} pr={pr} />
      </ViewerLoginContext.Provider>
    );
    const { rerender } = render(modal());
    const tab = screen.getByRole("button", { name: "Comments 12 · 3 new" });
    // Only the new part carries the accent.
    expect(within(tab).getByText("3 new")).toHaveClass("comment-count-new");
    expect(mockCounts).toHaveBeenCalledWith(pr, OLD_MARK, "me");

    // Loaded: the exact counts from what the tab shows.
    mockUsePRComments.mockReturnValue({ ...IDLE, comments: loadedComments });
    mockLoadedCounts.mockReturnValue({ total: 2, unread: 0, unreadAtLeast: false });
    rerender(modal());
    expect(screen.getByRole("button", { name: "Comments 2" })).toBeInTheDocument();
    expect(mockLoadedCounts).toHaveBeenCalledWith(loadedComments, OLD_MARK, "me");
  });

  it("keeps a truncated load from lowering the list's numbers or claiming to be exact", () => {
    mockCounts.mockReturnValue({ total: 140, unread: 3, unreadAtLeast: false });
    mockUsePRComments.mockReturnValue({
      ...IDLE,
      comments: { ...loadedComments, truncated: true },
    });
    mockLoadedCounts.mockReturnValue({ total: 100, unread: 2, unreadAtLeast: false });
    const { rerender } = render(<DescriptionModal {...baseProps} pr={makePR()} />);
    expect(screen.getByRole("button", { name: "Comments 140+ · 3+ new" })).toBeInTheDocument();

    mockLoadedCounts.mockReturnValue({ total: 150, unread: 5, unreadAtLeast: false });
    rerender(<DescriptionModal {...baseProps} pr={makePR()} />);
    expect(screen.getByRole("button", { name: "Comments 150+ · 5+ new" })).toBeInTheDocument();
  });

  it("says 20+ new when the list only saw the latest comments", () => {
    mockCounts.mockReturnValue({ total: 48, unread: 20, unreadAtLeast: true });
    render(<DescriptionModal {...baseProps} pr={makePR()} />);
    expect(screen.getByRole("button", { name: "Comments 48 · 20+ new" })).toBeInTheDocument();
  });

  it("shows a bare label without comments or comment data", () => {
    mockCounts.mockReturnValue({ total: 0, unread: 0, unreadAtLeast: false });
    const { rerender } = render(<DescriptionModal {...baseProps} pr={makePR()} />);
    expect(screen.getByRole("button", { name: "Comments" })).toBeInTheDocument();
    mockCounts.mockReturnValue(null);
    rerender(<DescriptionModal {...baseProps} pr={makePR()} />);
    expect(screen.getByRole("button", { name: "Comments" })).toBeInTheDocument();
  });

  it("reopens the same PR on its description", () => {
    const pr = makePR();
    const { rerender } = render(<DescriptionModal {...baseProps} pr={pr} />);
    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    rerender(<DescriptionModal {...baseProps} show={false} pr={pr} />);
    rerender(<DescriptionModal {...baseProps} pr={pr} />);
    expect(screen.getByRole("button", { name: "Description" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(fetchEnabled()).toBe(false);
  });

  it("opens the next PR on its description", () => {
    const { rerender } = render(<DescriptionModal {...baseProps} pr={makePR()} />);
    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    expect(screen.getByRole("button", { name: "Comments" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    rerender(<DescriptionModal {...baseProps} pr={makePR({ number: 43 })} />);
    expect(screen.getByRole("button", { name: "Description" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(fetchEnabled()).toBe(false);
  });
});

describe("DescriptionModal read marker", () => {
  /** The "New" pills on comments (the conversation's divider also says New). */
  const newPills = () => screen.queryAllByText("New", { selector: ".comment-new-pill" });

  it("marks the comments read once they've loaded, keeping what was new tagged", () => {
    mockUsePRComments.mockReturnValue({ ...IDLE, comments: commentsWithNew });
    const pr = makePR();
    render(<DescriptionModal {...baseProps} pr={pr} />);
    // Opening the modal on the description doesn't count as a look.
    expect(mockMarkRead).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Comments 2 · 1 new" }));
    // Read through the newest comment shown, not now: a cached load may predate newer ones.
    expect(mockMarkRead).toHaveBeenCalledTimes(1);
    expect(mockMarkRead).toHaveBeenCalledWith(pr, "2026-07-08T00:00:00.000Z");
    // The label goes by the new marker; the tags by the one from before this look.
    expect(screen.getByRole("button", { name: "Comments 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(newPills()).toHaveLength(1);
    expect(screen.getByText(/since you last looked/).parentElement).toHaveTextContent(
      "1 new since you last looked",
    );

    // Back and forth in the same open: no second mark, the tags stay.
    fireEvent.click(screen.getByRole("button", { name: "Description" }));
    fireEvent.click(screen.getByRole("button", { name: "Comments 2" }));
    expect(mockMarkRead).toHaveBeenCalledTimes(1);
    expect(newPills()).toHaveLength(1);
  });

  it("waits for the comments to load before marking them read", () => {
    mockCounts.mockReturnValue({ total: 12, unread: 3, unreadAtLeast: false });
    mockUsePRComments.mockReturnValue({ ...IDLE, loading: true });
    const { rerender } = render(<DescriptionModal {...baseProps} pr={makePR()} />);
    fireEvent.click(screen.getByRole("button", { name: "Comments 12 · 3 new" }));
    expect(mockMarkRead).not.toHaveBeenCalled();

    mockUsePRComments.mockReturnValue({ ...IDLE, comments: commentsWithNew });
    rerender(<DescriptionModal {...baseProps} pr={makePR()} />);
    expect(mockMarkRead).toHaveBeenCalledTimes(1);
    expect(newPills()).toHaveLength(1);
  });

  it("leaves the comments unread when they fail to load", () => {
    mockCounts.mockReturnValue({ total: 12, unread: 3, unreadAtLeast: false });
    mockUsePRComments.mockReturnValue({ ...IDLE, error: true });
    render(<DescriptionModal {...baseProps} pr={makePR()} />);
    fireEvent.click(screen.getByRole("button", { name: "Comments 12 · 3 new" }));
    expect(screen.getByText("Couldn't load comments.")).toBeInTheDocument();
    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Comments 12 · 3 new" })).toBeInTheDocument();
  });

  it("marks through the newest comment, even one ahead of our clock", () => {
    const ahead = new Date(Date.now() + 3_600_000).toISOString();
    const [bob] = commentsWithNew.conversation;
    mockUsePRComments.mockReturnValue({
      ...IDLE,
      comments: { ...commentsWithNew, conversation: [{ ...bob, created_at: ahead }] },
    });
    const pr = makePR();
    render(<DescriptionModal {...baseProps} pr={pr} />);
    fireEvent.click(screen.getByRole("button", { name: /Comments/ }));
    expect(mockMarkRead).toHaveBeenCalledWith(pr, ahead);
  });

  it("takes a fresh look on each open", () => {
    mockUsePRComments.mockReturnValue({ ...IDLE, comments: commentsWithNew });
    const pr = makePR();
    const { rerender } = render(<DescriptionModal {...baseProps} pr={pr} />);
    fireEvent.click(screen.getByRole("button", { name: /Comments/ }));
    rerender(<DescriptionModal {...baseProps} show={false} pr={pr} />);
    rerender(<DescriptionModal {...baseProps} pr={pr} />);
    expect(mockMarkRead).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Comments/ }));
    expect(mockMarkRead).toHaveBeenCalledTimes(2);
    // Read last time, so nothing's new now.
    expect(newPills()).toHaveLength(0);
    expect(screen.queryByText(/since you last looked/)).toBeNull();
  });
});

describe("DescriptionModal on a phone", () => {
  const desktop = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = desktop;
  });

  const checks = [
    { name: "lint", status: "SUCCESS", url: null },
    { name: "e2e", status: "FAILURE", url: null },
    { name: "deploy-preview", status: "IN_PROGRESS", url: null },
    { name: "build", status: "SUCCESS", url: null },
  ];

  it("moves Close and the GitHub link to a top bar", () => {
    const onHide = vi.fn();
    const pr = makePR();
    render(<DescriptionModal {...baseProps} onHide={onHide} pr={pr} url={pr.html_url} />);
    // No footer Close button: the ✕ in the top bar replaces it.
    expect(screen.queryByText("Close")).toBeNull();
    expect(screen.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute(
      "href",
      pr.html_url,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("copies the PR link from the top bar", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const pr = makePR();
    render(<DescriptionModal {...baseProps} pr={pr} url={pr.html_url} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("https://github.com/o/r/pull/42");
    expect(await screen.findByText("Copied PR link to clipboard")).toBeInTheDocument();
  });

  it("folds the checks into a summary that opens the list", () => {
    render(<DescriptionModal {...baseProps} pr={makePR()} checks={checks} />);
    const summary = screen.getByRole("button", { name: /1 failing · 1 running · 2 passed/ });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("lint")).toBeNull();
    fireEvent.click(summary);
    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("lint")).toBeInTheDocument();
    expect(screen.getByText("e2e")).toBeInTheDocument();
  });

  it("starts on Overview, with the comments not yet fetched", async () => {
    render(<DescriptionModal {...baseProps} pr={makePR()} checks={checks} />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Overview", "Comments", "Notes"]);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    // The Markdown renderer loads lazily.
    expect(await screen.findByText("Body text")).toBeVisible();
    expect(screen.getByRole("button", { name: /2 passed/ })).toBeVisible();
    expect(screen.getByTestId("notes-panel")).not.toBeVisible();
    expect(fetchEnabled()).toBe(false);
  });

  it("fetches and shows the comments on the Comments chip", async () => {
    mockUsePRComments.mockReturnValue({ ...IDLE, comments: loadedComments });
    render(<DescriptionModal {...baseProps} pr={makePR()} />);
    expect(await screen.findByText("Body text")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /Comments/ }));
    expect(fetchEnabled()).toBe(true);
    expect(screen.getByRole("tab", { name: /Comments/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Rename x")).toBeVisible();
    expect(screen.getByText("Body text")).not.toBeVisible();
  });

  it("counts comments on the Comments chip, with the new ones in a pill", () => {
    mockCounts.mockReturnValue({ total: 12, unread: 3, unreadAtLeast: false });
    render(<DescriptionModal {...baseProps} pr={makePR()} />);
    const chip = screen.getByRole("tab", { name: "Comments, 12 comments, 3 new" });
    expect(chip).toHaveTextContent("Comments123 new");
    expect(within(chip).getByText("12")).toHaveClass("modal-phone-tab-count");
    expect(within(chip).getByText("3 new")).toHaveClass("comment-new-pill");
  });

  it("shows just the total once everything is read", () => {
    mockCounts.mockReturnValue({ total: 1, unread: 0, unreadAtLeast: false });
    render(<DescriptionModal {...baseProps} pr={makePR()} />);
    const chip = screen.getByRole("tab", { name: "Comments, 1 comment" });
    expect(chip.querySelector(".comment-new-pill")).toBeNull();
  });

  it("marks the comments read from the Comments chip", () => {
    mockUsePRComments.mockReturnValue({ ...IDLE, comments: loadedComments });
    const pr = makePR();
    render(<DescriptionModal {...baseProps} pr={pr} />);
    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    expect(mockMarkRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: /Comments/ }));
    expect(mockMarkRead).toHaveBeenCalledWith(pr, expect.any(String));
  });

  it("shows the notes on the Notes chip, keeping them mounted when hidden", () => {
    render(<DescriptionModal {...baseProps} pr={makePR()} />);
    const notes = screen.getByTestId("notes-panel");
    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    expect(notes).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByTestId("notes-panel")).toBe(notes);
    expect(notes).not.toBeVisible();
  });

  it("has no chips without a PR", async () => {
    render(<DescriptionModal {...baseProps} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(await screen.findByText("Body text")).toBeVisible();
  });
});

describe("DescriptionModal on a desktop", () => {
  it("keeps the footer Close button and has no phone top bar", () => {
    render(<DescriptionModal {...baseProps} pr={makePR()} />);
    expect(screen.getByText("Close")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });
});

describe("DescriptionModal comments toast", () => {
  it("drops a resolve toast when another PR opens, so its Undo can't act there", () => {
    const setThreadResolved = vi.fn().mockResolvedValue(undefined);
    mockUsePRComments.mockReturnValue({ ...IDLE, comments: loadedComments, setThreadResolved });
    const { rerender } = render(<DescriptionModal {...baseProps} pr={makePR()} />);
    fireEvent.click(screen.getByRole("button", { name: /Comments/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Resolve" })[0]);
    expect(screen.getByText("Resolved thread")).toHaveClass("is-visible");
    rerender(<DescriptionModal {...baseProps} pr={makePR({ number: 43 })} />);
    expect(screen.getByText("Resolved thread")).not.toHaveClass("is-visible");
  });
});
