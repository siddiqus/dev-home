import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReviewQueuePanel } from "./ReviewQueuePanel";
import type { ReviewQueueEntry } from "../../../types/teams";

const entries: ReviewQueueEntry[] = [
  {
    number: 12,
    repo_full_name: "acme/web",
    title: "PLAT-101 health strip",
    html_url: "https://github.com/acme/web/pull/12",
    author: "tashfia",
    state: "none",
    reason: "no reviewer assigned",
    reviewers: [],
    checks_status: "FAILURE",
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
  {
    number: 20,
    repo_full_name: "acme/web",
    title: "PLAT-102 token refresh",
    html_url: "https://github.com/acme/web/pull/20",
    author: "nadman",
    state: "author",
    reason: "changes requested",
    reviewers: ["carol"],
    checks_status: "SUCCESS",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
  },
];

/** The panel is collapsed by default; expand it to reveal the table/filter. */
function expand() {
  fireEvent.click(screen.getByText(/REVIEW QUEUE/));
}

describe("ReviewQueuePanel", () => {
  it("is collapsed by default and expands on header click", () => {
    render(<ReviewQueuePanel entries={entries} />);
    // Header (with count) is visible, but the table is hidden until expanded.
    expect(screen.getByText(/REVIEW QUEUE · 2/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    expand();
    expect(screen.getByRole("table")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/REVIEW QUEUE/));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders a row per entry with title link, reason, author, reviewers, and state label", () => {
    render(<ReviewQueuePanel entries={entries} />);
    expand();

    const link = screen.getByRole("link", { name: /PLAT-101 health strip/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/web/pull/12");

    expect(screen.getByText("no reviewer assigned")).toBeInTheDocument();
    expect(screen.getByText("changes requested")).toBeInTheDocument();
    expect(screen.getByText("tashfia")).toBeInTheDocument();
    expect(screen.getByText("carol")).toBeInTheDocument();
    expect(screen.getByText("No reviewer")).toBeInTheDocument();
    // "Author" also appears as a column header; scope to the state-label <span>.
    expect(screen.getByText("Author", { selector: "span" })).toBeInTheDocument();
  });

  it("renders an empty state when there are no entries", () => {
    render(<ReviewQueuePanel entries={[]} />);
    expand();
    expect(screen.getByText("No open PRs.")).toBeInTheDocument();
  });

  it("does not render the member filter when no members are provided", () => {
    render(<ReviewQueuePanel entries={entries} />);
    expand();
    expect(screen.queryByText("All members")).not.toBeInTheDocument();
  });

  it("filters the queue to the selected team member (author or reviewer)", () => {
    const members = [
      { login: "tashfia", name: "Tashfia" },
      { login: "nadman", name: "Nadman" },
    ];
    render(<ReviewQueuePanel entries={entries} members={members} />);
    expand();

    // Both PRs visible before filtering.
    expect(screen.getByText(/PLAT-101 health strip/)).toBeInTheDocument();
    expect(screen.getByText(/PLAT-102 token refresh/)).toBeInTheDocument();

    // Open the member dropdown and pick Nadman.
    fireEvent.click(screen.getByText("All members"));
    fireEvent.mouseDown(screen.getByText("Nadman"));

    // Only Nadman's PR remains; the count reflects the filter.
    expect(screen.queryByText(/PLAT-101 health strip/)).not.toBeInTheDocument();
    expect(screen.getByText(/PLAT-102 token refresh/)).toBeInTheDocument();
    expect(screen.getByText(/REVIEW QUEUE · 1/)).toBeInTheDocument();
  });
});
