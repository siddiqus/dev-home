import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { PRSections } from "./PRSections";
import type { GitHubPR } from "../types";

function makePR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: Math.floor(Math.random() * 1e9),
    number: 1,
    title: "Test PR",
    html_url: "https://github.com/o/r/pull/1",
    state: "open",
    draft: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    user: { login: "octocat", avatar_url: "" },
    head: { ref: "feature" },
    base: { ref: "main" },
    body: "",
    repository_url: "https://api.github.com/repos/o/r",
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    in_merge_queue: false,
    ...overrides,
  };
}

const sectionOf = (label: string): HTMLElement =>
  screen.getByText(label).closest(".pr-section") as HTMLElement;

describe("PRSections", () => {
  beforeEach(() => localStorage.clear());

  it("renders only non-empty sections, each with its label and count", () => {
    render(
      <PRSections
        loading={false}
        prs={[
          makePR({ title: "ready pr", review_status: "APPROVED", checks_status: "SUCCESS" }),
          makePR({ title: "needs pr", checks_status: "FAILURE" }),
          makePR({ title: "pending a", checks_status: "SUCCESS" }),
          makePR({ title: "pending b", checks_status: null }),
        ]}
      />,
    );

    expect(screen.getByText("Ready to merge")).toBeInTheDocument();
    expect(screen.getByText("Needs action")).toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    // No drafts provided -> the Drafts section is hidden entirely.
    expect(screen.queryByText("Drafts")).not.toBeInTheDocument();

    expect(within(sectionOf("Ready to merge")).getByText("1")).toBeInTheDocument();
    expect(within(sectionOf("Pending review")).getByText("2")).toBeInTheDocument();
  });

  it("routes each PR into the correct section", () => {
    render(
      <PRSections
        loading={false}
        prs={[
          makePR({ title: "the ready one", in_merge_queue: true }),
          makePR({ title: "the needs one", review_status: "CHANGES_REQUESTED" }),
          makePR({ title: "the draft one", draft: true }),
        ]}
      />,
    );

    expect(within(sectionOf("Ready to merge")).getByText("the ready one")).toBeInTheDocument();
    expect(within(sectionOf("Needs action")).getByText("the needs one")).toBeInTheDocument();
    expect(within(sectionOf("Drafts")).getByText("the draft one")).toBeInTheDocument();
  });

  it("collapses a section, hiding its rows, when its header is clicked", () => {
    render(
      <PRSections
        loading={false}
        prs={[
          makePR({ title: "collapse me", review_status: "APPROVED", checks_status: "SUCCESS" }),
        ]}
      />,
    );

    expect(screen.getByText("collapse me")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ready to merge"));
    expect(screen.queryByText("collapse me")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no PRs", () => {
    render(<PRSections loading={false} prs={[]} />);
    expect(screen.getByText("No open pull requests")).toBeInTheDocument();
  });
});
