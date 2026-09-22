import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DescriptionModal } from "./DescriptionModal";
import type { GitHubPR } from "../types";

// The notes column needs the Notes context; it's irrelevant to the header
// indicators under test here, so stub it out.
vi.mock("./PrNotesPanel", () => ({
  PrNotesPanel: () => <div data-testid="notes-panel" />,
}));

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

  it("hides review indicators on a merged PR but keeps merged-by and labels", () => {
    render(
      <DescriptionModal
        {...baseProps}
        pr={makePR({
          review_status: "APPROVED",
          merged_at: "2026-07-11T00:00:00Z",
          merged_by: "alice",
          labels: [{ name: "bug", color: "d73a4a" }],
        })}
      />,
    );

    expect(document.querySelector(".pr-card-status")).toBeNull();
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
