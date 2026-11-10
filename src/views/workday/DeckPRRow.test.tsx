import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubPR } from "../../types";
import { ViewerLoginContext } from "../../context/ViewerLoginContext";
import { MergeProvider } from "../../context/MergeContext";
import { commentCounts } from "../../utils/commentCounts";
import { DeckPRRow } from "./DeckPRRow";
import type { DeckPR, Signal } from "./deckTypes";

vi.mock("../../utils/commentCounts", () => ({ commentCounts: vi.fn() }));
vi.mock("../../services/commentsRead", () => ({
  useCommentsReadAt: () => "2026-10-13T00:00:00Z",
}));
const mockCounts = vi.mocked(commentCounts);

beforeEach(() => {
  mockCounts.mockReset();
  mockCounts.mockReturnValue(null);
});

const NOW = new Date("2026-10-14T12:00:00Z");

function item(p: Partial<GitHubPR>, signals: Signal[]): DeckPR {
  return {
    pr: {
      id: 7,
      number: 7,
      title: "CCP-1 Ship it",
      html_url: "https://github.com/o/r/pull/7",
      state: "open",
      draft: false,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-14T10:00:00Z",
      user: { login: "me", avatar_url: "" },
      head: { ref: "b-7", sha: "abc" },
      base: { ref: "main" },
      repo_full_name: "o/r",
      checks_status: "SUCCESS",
      checks: [],
      review_status: "APPROVED",
      requested_reviewers: [],
      ...p,
    },
    mine: true,
    signals,
    priority: 3,
    unseenComment: null,
    note: null,
    current: false,
    unseen: false,
  };
}

function renderRow(row: DeckPR, extra: { alwaysShowAuthor?: boolean } = {}) {
  const onSelect = vi.fn();
  const onOpen = vi.fn();
  const { container } = render(
    <ViewerLoginContext.Provider value="me">
      <MergeProvider>
        <DeckPRRow
          id="row"
          item={row}
          ticketKey="CCP-1"
          selected={false}
          now={NOW}
          onSelect={onSelect}
          onOpen={onOpen}
          {...extra}
        />
      </MergeProvider>
    </ViewerLoginContext.Provider>,
  );
  return { onSelect, onOpen, container };
}

describe("DeckPRRow merge button", () => {
  it("turns my ready PR's first chip into the Merge button, keeping the other chips", () => {
    const { onSelect, onOpen } = renderRow(
      item({}, [
        { label: "✓ Ready to merge", tone: "success" },
        { label: "1 open thread", tone: "warning" },
      ]),
    );
    expect(screen.queryByText("✓ Ready to merge")).not.toBeInTheDocument();
    expect(screen.getByText("1 open thread")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("keeps the chip while the PR isn't ready", () => {
    renderRow(
      item({ checks_status: "PENDING" }, [
        { label: "✓ Approved · merge when CI passes", tone: "success" },
      ]),
    );
    expect(screen.getByText("✓ Approved · merge when CI passes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();
  });
});

describe("DeckPRRow comment count", () => {
  const signals = (n: number): Signal[] =>
    Array.from({ length: n }, (_, i) => ({ label: `signal ${i}`, tone: "warning" as const }));
  const chips = (container: HTMLElement) =>
    [...container.querySelectorAll(".deck-pr-signals > *")].map((c) => c.textContent);

  it("ends the signals row, after the +N it's never folded into", () => {
    mockCounts.mockReturnValue({ total: 12, unread: 3, unreadAtLeast: false });
    const { container } = renderRow(item({ checks_status: "PENDING" }, signals(6)));
    expect(chips(container)).toEqual([
      "signal 0",
      "signal 1",
      "signal 2",
      "signal 3",
      "+2",
      "12 · 3 new",
    ]);
  });

  it("brings the signals row along when it's the only thing to show", () => {
    mockCounts.mockReturnValue({ total: 4, unread: 0, unreadAtLeast: false });
    const { container } = renderRow(item({}, []));
    expect(chips(container)).toEqual(["4"]);
  });

  it("leaves no empty row without comments or signals", () => {
    mockCounts.mockReturnValue({ total: 0, unread: 0, unreadAtLeast: false });
    const { container } = renderRow(item({}, []));
    expect(container.querySelector(".deck-pr-signals")).toBeNull();
  });
});

describe("DeckPRRow author", () => {
  it("hides my own login on Workday", () => {
    const { container } = renderRow(item({}, []));
    expect(container.querySelector(".deck-pr-author")).toBeNull();
    expect(container.querySelector(".deck-pr-avatar")).toBeNull();
  });

  it("leads someone else's PR with their avatar and login, before repo#number", () => {
    const { container } = renderRow(
      item({ user: { login: "tomas", avatar_url: "https://avatars/tomas.png" } }, []),
    );
    const author = container.querySelector(".deck-pr-author")!;
    expect(author).toHaveTextContent("tomas");
    expect(author.querySelector("img.deck-pr-avatar")).toHaveAttribute(
      "src",
      "https://avatars/tomas.png",
    );
    const meta = container.querySelector(".deck-pr-meta")!;
    expect(meta.firstElementChild).toBe(author);
  });

  it("shows the login alone when the author has no avatar", () => {
    const { container } = renderRow(item({ user: { login: "tomas", avatar_url: "" } }, []));
    expect(container.querySelector(".deck-pr-author")).toHaveTextContent("tomas");
    expect(container.querySelector(".deck-pr-avatar")).toBeNull();
  });

  it("shows any author, me included, when asked (PR search)", () => {
    const { container } = renderRow(item({}, []), { alwaysShowAuthor: true });
    expect(container.querySelector(".deck-pr-author")).toHaveTextContent("me");
  });
});

describe("DeckPRRow unseen comment", () => {
  const comment = {
    id: "c1",
    source: "GitHub" as const,
    who: "tomas",
    ticketKey: "CCP-1",
    where: "r#7",
    snippet: "Can we rename this?",
    at: "2026-10-14T11:00:00Z",
    url: "https://github.com/o/r/pull/7#issuecomment-1",
  };
  const desktop = window.matchMedia;
  const onPhone = (matches: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  };
  afterEach(() => {
    window.matchMedia = desktop;
  });

  it("links the quote to the comment on GitHub on desktop", () => {
    onPhone(false);
    const { onOpen } = renderRow({ ...item({}, []), unseenComment: comment });
    const quote = screen.getByRole("link", { name: /Can we rename this/ });
    expect(quote).toHaveAttribute("href", comment.url);
    fireEvent.click(quote);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("is plain text on a phone, so a tap opens the PR like the rest of the row", () => {
    onPhone(true);
    const { onOpen } = renderRow({ ...item({}, []), unseenComment: comment });
    expect(screen.queryByRole("link", { name: /Can we rename this/ })).toBeNull();
    fireEvent.click(screen.getByText(/Can we rename this/));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
