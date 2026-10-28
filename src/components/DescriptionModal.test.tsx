import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DescriptionModal } from "./DescriptionModal";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import { MergeProvider } from "../context/MergeContext";
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

  it("keeps the description and the notes panel in the one scroll", async () => {
    render(<DescriptionModal {...baseProps} pr={makePR()} checks={checks} />);
    // The Markdown renderer loads lazily.
    expect(await screen.findByText("Body text")).toBeInTheDocument();
    expect(screen.getByTestId("notes-panel")).toBeInTheDocument();
  });
});

describe("DescriptionModal on a desktop", () => {
  it("keeps the footer Close button and has no phone top bar", () => {
    render(<DescriptionModal {...baseProps} pr={makePR()} />);
    expect(screen.getByText("Close")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });
});
