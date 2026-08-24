import { render, screen } from "@testing-library/react";
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

describe("ReviewQueuePanel", () => {
  it("renders a row per entry with title link, reason, author, reviewers, and state label", () => {
    render(<ReviewQueuePanel entries={entries} />);
    expect(screen.getByText(/REVIEW QUEUE · 2/)).toBeInTheDocument();

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
    expect(screen.getByText("No open PRs.")).toBeInTheDocument();
  });
});
