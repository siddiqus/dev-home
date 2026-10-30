import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommentCountChip, useCommentCounts } from "./CommentCountChip";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import { commentCounts } from "../utils/commentCounts";
import { useCommentsReadAt } from "../services/commentsRead";
import type { GitHubPR } from "../types";

vi.mock("../utils/commentCounts", () => ({ commentCounts: vi.fn() }));
vi.mock("../services/commentsRead", () => ({ useCommentsReadAt: vi.fn() }));
const mockCounts = vi.mocked(commentCounts);
const mockReadAt = vi.mocked(useCommentsReadAt);

const READ_AT = "2026-10-20T00:00:00Z";

const pr = {
  number: 42,
  repo_full_name: "o/r",
  comment_count: 12,
} as GitHubPR;

beforeEach(() => {
  mockCounts.mockReset();
  mockReadAt.mockReset();
  mockReadAt.mockReturnValue(READ_AT);
});

describe("CommentCountChip", () => {
  const chipOf = (container: HTMLElement) =>
    container.querySelector(".comment-count-chip") as HTMLElement;

  it("shows the total and the new ones, only the new part in the accent", () => {
    const { container } = render(
      <CommentCountChip counts={{ total: 12, unread: 3, unreadAtLeast: false }} />,
    );
    const chip = chipOf(container);
    expect(chip).toHaveClass("badge-status--neutral");
    expect(chip).toHaveTextContent("12 · 3 new");
    expect(screen.getByText("3 new")).toHaveClass("comment-count-new");
    expect(chip).toHaveAttribute("title", "12 comments · 3 new since you last opened them");
    expect(chip.querySelector("svg")).toBeInTheDocument();
  });

  it("shows just the total once everything is read", () => {
    const { container } = render(
      <CommentCountChip counts={{ total: 1, unread: 0, unreadAtLeast: false }} />,
    );
    const chip = chipOf(container);
    expect(chip).toHaveTextContent(/^1$/);
    expect(chip).toHaveAttribute("title", "1 comment");
    expect(container.querySelector(".comment-count-new")).toBeNull();
  });

  it("says 20+ new when older comments weren't fetched", () => {
    const { container } = render(
      <CommentCountChip counts={{ total: 48, unread: 20, unreadAtLeast: true }} />,
    );
    expect(screen.getByText("20+ new")).toHaveClass("comment-count-new");
    expect(chipOf(container)).toHaveAttribute(
      "title",
      "48 comments · 20+ new since you last opened them",
    );
  });

  it("renders nothing without counts", () => {
    const { container } = render(<CommentCountChip counts={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("useCommentCounts", () => {
  const counts = (viewer = "me") =>
    renderHook(() => useCommentCounts(pr), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ViewerLoginContext.Provider value={viewer}>{children}</ViewerLoginContext.Provider>
      ),
    }).result.current;

  it("counts from the viewer's read marker", () => {
    mockCounts.mockReturnValue({ total: 12, unread: 3, unreadAtLeast: false });
    expect(counts("sabbir")).toEqual({ total: 12, unread: 3, unreadAtLeast: false });
    expect(mockReadAt).toHaveBeenCalledWith(pr);
    expect(mockCounts).toHaveBeenCalledWith(pr, READ_AT, "sabbir");
  });

  it("passes no viewer when the login is unknown", () => {
    mockCounts.mockReturnValue({ total: 1, unread: 0, unreadAtLeast: false });
    counts("");
    expect(mockCounts).toHaveBeenCalledWith(pr, READ_AT, null);
  });

  it("is null without comment data or without comments", () => {
    mockCounts.mockReturnValue(null);
    expect(counts()).toBeNull();
    mockCounts.mockReturnValue({ total: 0, unread: 0, unreadAtLeast: false });
    expect(counts()).toBeNull();
  });
});

describe("CommentCountChip lower bounds", () => {
  it("shows a + on a total that's only a lower bound", () => {
    const { container } = render(
      <CommentCountChip
        counts={{ total: 30, totalAtLeast: true, unread: 2, unreadAtLeast: true }}
      />,
    );
    expect(container).toHaveTextContent("30+ · 2+ new");
    expect(container.firstChild).toHaveAttribute(
      "title",
      "30+ comments · 2+ new since you last opened them",
    );
  });
});
