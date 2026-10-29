import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReviewQueuePanel } from "./ReviewQueuePanel";
import type { ReviewQueueEntry } from "../../../types/teams";

let n = 0;
function entry(overrides: Partial<ReviewQueueEntry>): ReviewQueueEntry {
  n += 1;
  return {
    number: n,
    repo_full_name: "acme/web",
    title: `PR ${n}`,
    html_url: `https://github.com/acme/web/pull/${n}`,
    author: "tashfia",
    state: "waitingReview",
    reason: "awaiting first review",
    reviewers: [],
    checks_status: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    waitingSince: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const members = [
  { login: "tashfia", name: "Tashfia" },
  { login: "nadman", name: "Nadman" },
];

describe("ReviewQueuePanel", () => {
  it("groups PRs under the state names, most urgent group first", () => {
    render(
      <ReviewQueuePanel
        entries={[
          entry({ state: "withAuthor", title: "Fix typo" }),
          entry({ state: "readyToMerge", title: "Bump deps" }),
          entry({ state: "needsReviewer", title: "Calendar lazy-load" }),
          entry({ state: "waitingReview", title: "Drop serializer" }),
        ]}
      />,
    );
    const headings = screen
      .getAllByTestId("review-group")
      .map((el) => el.textContent?.replace(/\d+$/, ""));
    expect(headings).toEqual([
      "Needs a reviewer",
      "Waiting for review",
      "Ready to merge",
      "Back with author",
    ]);
  });

  it("shows at most two PRs per group and never drafts", () => {
    render(
      <ReviewQueuePanel
        entries={[
          entry({ title: "First" }),
          entry({ title: "Second" }),
          entry({ title: "Third" }),
          entry({ state: "draft", title: "WIP thing" }),
        ]}
      />,
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("Third")).not.toBeInTheDocument();
    expect(screen.queryByText("WIP thing")).not.toBeInTheDocument();
    // The group header still counts every PR in it.
    expect(screen.getByTestId("review-group")).toHaveTextContent("Waiting for review3");
  });

  it("names the reviewers when it's their move, the author otherwise", () => {
    render(
      <ReviewQueuePanel
        entries={[
          entry({ title: "Waiting", reviewers: ["carol", "dave"] }),
          entry({ state: "withAuthor", title: "Changes", author: "nadman", reviewers: ["carol"] }),
        ]}
      />,
    );
    const waiting = screen.getByText("Waiting").closest("button")!;
    expect(within(waiting).getByText(/on @carol \+1/)).toBeInTheDocument();
    const changes = screen.getByText("Changes").closest("button")!;
    expect(within(changes).getByText("@nadman")).toBeInTheDocument();
  });

  it("opens the PR when a row is clicked", () => {
    const onOpenPR = vi.fn();
    render(
      <ReviewQueuePanel entries={[entry({ title: "Open me", number: 77 })]} onOpenPR={onOpenPR} />,
    );
    fireEvent.click(screen.getByText("Open me"));
    expect(onOpenPR).toHaveBeenCalledWith("acme/web", 77);
  });

  it("opens the full list in a modal from See all", () => {
    render(
      <ReviewQueuePanel
        entries={[entry({ title: "Visible" }), entry({ state: "draft", title: "Hidden draft" })]}
        members={members}
      />,
    );
    fireEvent.click(screen.getByText("See all 2 →"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Hidden draft")).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("Search PRs, people…")).toBeInTheDocument();
  });

  it("renders an empty state when there are no entries", () => {
    render(<ReviewQueuePanel entries={[]} />);
    expect(screen.getByText("No open PRs.")).toBeInTheDocument();
    expect(screen.queryByText(/See all/)).not.toBeInTheDocument();
  });
});
