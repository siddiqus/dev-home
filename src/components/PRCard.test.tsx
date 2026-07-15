import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PRCard, type PRCardFields } from "./PRCard";
import type { GitHubPR } from "../types";

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
    body: "",
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    in_merge_queue: false,
    merged_at: undefined,
    ...overrides,
  };
}

const FIELDS: Record<string, PRCardFields> = {
  full: {
    showAuthor: true,
    showBranch: true,
    showStatus: true,
    showChecks: true,
    timestamps: "open",
  },
  reviews: {
    showAuthor: true,
    showBranch: false,
    showStatus: false,
    showChecks: true,
    timestamps: "open",
  },
  merged: {
    showAuthor: false,
    showBranch: true,
    showStatus: false,
    showChecks: false,
    timestamps: "merged",
  },
};

const noop = () => {};

describe("PRCard", () => {
  it("renders title, repo#number, and a GitHub external link", () => {
    render(<PRCard pr={makePR()} fields={FIELDS.full} onOpen={noop} />);
    expect(screen.getByText("Test PR")).toBeInTheDocument();
    expect(screen.getByText("o/r#42")).toBeInTheDocument();
    const gh = screen.getByTitle("Open PR on GitHub");
    expect(gh).toHaveAttribute("href", "https://github.com/o/r/pull/42");
    expect(gh).toHaveAttribute("target", "_blank");
  });

  it("opens the PR when the card is clicked", () => {
    const onOpen = vi.fn();
    render(<PRCard pr={makePR()} fields={FIELDS.full} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not open the PR when the GitHub link is clicked (stopPropagation)", () => {
    const onOpen = vi.fn();
    render(<PRCard pr={makePR()} fields={FIELDS.full} onOpen={onOpen} />);
    fireEvent.click(screen.getByTitle("Open PR on GitHub"));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("shows the branch (head only for the default base) when showBranch is set", () => {
    render(
      <PRCard pr={makePR({ head: { ref: "my-branch" } })} fields={FIELDS.full} onOpen={noop} />,
    );
    expect(screen.getByText("my-branch")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it("shows head → base when the base is not the default branch", () => {
    render(
      <PRCard
        pr={makePR({ head: { ref: "my-branch" }, base: { ref: "release/3.2" } })}
        fields={FIELDS.full}
        onOpen={noop}
      />,
    );
    expect(screen.getByText(/→ release\/3\.2/)).toBeInTheDocument();
  });

  it("hides the branch when showBranch is false (reviews variant)", () => {
    render(
      <PRCard
        pr={makePR({ head: { ref: "hidden-branch" } })}
        fields={FIELDS.reviews}
        onOpen={noop}
      />,
    );
    expect(screen.queryByText("hidden-branch")).not.toBeInTheDocument();
  });

  it("shows the author only when showAuthor is set", () => {
    const { rerender } = render(
      <PRCard
        pr={makePR({ user: { login: "alice", avatar_url: "" } })}
        fields={FIELDS.full}
        onOpen={noop}
      />,
    );
    expect(screen.getByText("alice")).toBeInTheDocument();

    rerender(
      <PRCard
        pr={makePR({ user: { login: "alice", avatar_url: "" } })}
        fields={{ ...FIELDS.full, showAuthor: false }}
        onOpen={noop}
      />,
    );
    expect(screen.queryByText("alice")).not.toBeInTheDocument();
  });

  it("derives the status pill from PR state", () => {
    const cases: [Partial<GitHubPR>, string][] = [
      [{ review_status: "APPROVED" }, "Approved"],
      [{ review_status: "CHANGES_REQUESTED" }, "Changes requested"],
      [{ review_status: "REVIEWED" }, "Reviewed"],
      [{ review_status: null }, "Awaiting review"],
      [{ draft: true }, "Draft"],
      [{ in_merge_queue: true }, "In Merge Queue"],
    ];
    for (const [overrides, label] of cases) {
      const { unmount } = render(
        <PRCard pr={makePR(overrides)} fields={FIELDS.full} onOpen={noop} />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("hides the status pill when showStatus is false", () => {
    render(
      <PRCard pr={makePR({ review_status: "APPROVED" })} fields={FIELDS.reviews} onOpen={noop} />,
    );
    expect(screen.queryByText("Approved")).not.toBeInTheDocument();
  });

  it("renders opened/updated timestamps for open variants and merged for merged variants", () => {
    const { unmount } = render(<PRCard pr={makePR()} fields={FIELDS.full} onOpen={noop} />);
    expect(screen.getByText(/opened .* · updated /)).toBeInTheDocument();
    unmount();

    render(
      <PRCard
        pr={makePR({ merged_at: "2026-07-05T00:00:00Z" })}
        fields={FIELDS.merged}
        onOpen={noop}
      />,
    );
    expect(screen.getByText(/^merged /)).toBeInTheDocument();
  });

  it("linkifies the Jira ticket in place when the title already contains it", () => {
    render(
      <PRCard
        pr={makePR({ title: "PROJ-7: Update the widget" })}
        fields={FIELDS.full}
        singleTicket="PROJ-7"
        jiraBaseUrl="https://jira.example.com"
        onOpen={noop}
      />,
    );
    const link = screen.getByRole("link", { name: "PROJ-7" });
    expect(link).toHaveAttribute("href", "https://jira.example.com/browse/PROJ-7");
    // The ticket must appear exactly once — no "PROJ-7: PROJ-7: …" duplication.
    expect(screen.getAllByText(/PROJ-7/)).toHaveLength(1);
  });

  it("prepends the ticket link when the title does not contain it", () => {
    render(
      <PRCard
        pr={makePR({ title: "Update the widget" })}
        fields={FIELDS.full}
        singleTicket="PROJ-7"
        jiraBaseUrl="https://jira.example.com"
        onOpen={noop}
      />,
    );
    const link = screen.getByRole("link", { name: "PROJ-7" });
    expect(link).toHaveAttribute("href", "https://jira.example.com/browse/PROJ-7");
  });
});
