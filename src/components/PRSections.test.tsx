import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { createRef } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { PRSections, type PRSectionsHandle } from "./PRSections";
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

  it("collapse-all toggles Jira ticket groups (not sections), hiding grouped rows", () => {
    const ref = createRef<PRSectionsHandle>();
    render(
      <PRSections
        ref={ref}
        loading={false}
        prs={[
          makePR({
            id: 101,
            number: 101,
            title: "grouped one",
            head: { ref: "PROJ-1-a" },
            review_status: "APPROVED",
            checks_status: "SUCCESS",
          }),
          makePR({
            id: 102,
            number: 102,
            title: "grouped two",
            head: { ref: "PROJ-1-b" },
            review_status: "APPROVED",
            checks_status: "SUCCESS",
          }),
        ]}
      />,
    );

    // Two PRs sharing ticket PROJ-1 form a collapsible group inside the section.
    expect(ref.current?.hasGroups).toBe(true);
    expect(screen.getByText("PROJ-1")).toBeInTheDocument();
    expect(screen.getByText("grouped one")).toBeInTheDocument();
    expect(screen.getByText("grouped two")).toBeInTheDocument();

    // Collapse-all hides the grouped PR rows but keeps the section + group header.
    act(() => ref.current?.toggleCollapseAll());
    expect(ref.current?.allCollapsed).toBe(true);
    expect(screen.getByText("Ready to merge")).toBeInTheDocument();
    expect(screen.getByText("PROJ-1")).toBeInTheDocument();
    expect(screen.queryByText("grouped one")).not.toBeInTheDocument();
    expect(screen.queryByText("grouped two")).not.toBeInTheDocument();

    // Toggling again expands the group back.
    act(() => ref.current?.toggleCollapseAll());
    expect(screen.getByText("grouped one")).toBeInTheDocument();
  });
});
