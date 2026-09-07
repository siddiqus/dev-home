import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { PRsView } from "./PRsView";
import type { GitHubPR, JiraIssue } from "../../types";

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

describe("PRsView open PRs tab count", () => {
  // configured=false stops the mount-time recently-merged fetch from hitting the network.
  beforeEach(() => localStorage.clear());

  it("shows the count from existing data even while a (re)load is in flight", () => {
    render(<PRsView openPRs={[makePR(), makePR()]} loading={true} configured={false} />);
    expect(screen.getByRole("button", { name: "Open PRs (2)" })).toBeInTheDocument();
  });

  it("shows (0) once loaded with no open PRs", () => {
    render(<PRsView openPRs={[]} loading={false} configured={false} />);
    expect(screen.getByRole("button", { name: "Open PRs (0)" })).toBeInTheDocument();
  });

  it("hides the count during the initial load when there is no data yet", () => {
    render(<PRsView openPRs={[]} loading={true} configured={false} />);
    expect(screen.getByRole("button", { name: "Open PRs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open PRs \(/ })).not.toBeInTheDocument();
  });
});

describe("PRsView sidebar filters", () => {
  beforeEach(() => localStorage.clear());

  // Dropdown option rows carry the class "multi-select-item"; the same text can
  // also appear on PR-card reason chips, so scope option clicks to that class.
  const clickOption = (name: string) => {
    const option = screen
      .getAllByText(name)
      .find((el) => el.classList.contains("multi-select-item"));
    if (!option) throw new Error(`dropdown option "${name}" not found`);
    fireEvent.mouseDown(option);
  };

  // The tab button always shows the unfiltered total; the *filtered* result count
  // is the sidebar's "N of M" readout (only rendered while a filter is active).
  const filterCount = () => {
    const el = document.querySelector(".prs-filter-count");
    if (!el) throw new Error("filter count is not shown (no active filter?)");
    return el.textContent;
  };

  it("'Actionable' filter matches ANY selected reason (OR), folding in CI failed", () => {
    render(
      <PRsView
        openPRs={[
          makePR({ checks_status: "FAILURE" }), // CI failed
          makePR({ your_turn: true, checks_status: "SUCCESS" }), // Your turn
          makePR({ checks_status: "SUCCESS" }), // neither
        ]}
        loading={false}
        configured={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Open PRs (3)" })).toBeInTheDocument();

    // Only CI failed -> 1 PR.
    fireEvent.click(screen.getByText("All actionable"));
    clickOption("CI failed");
    expect(filterCount()).toBe("1 of 3");

    // Add Your turn: OR semantics widen to both matching PRs.
    clickOption("Your turn");
    expect(filterCount()).toBe("2 of 3");
  });

  it("'Jira tickets' filter narrows by ticket key and labels options with the Jira summary", () => {
    const jiraIssues = [{ key: "PROJ-1", summary: "Add single sign-on" }] as unknown as JiraIssue[];
    render(
      <PRsView
        openPRs={[
          makePR({ title: "PROJ-1: Add SSO" }),
          makePR({ title: "PROJ-2: Fix bug" }),
          makePR({ title: "No ticket here" }),
        ]}
        jiraIssues={jiraIssues}
        loading={false}
        configured={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Open PRs (3)" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("All tickets"));
    // PROJ-1's option carries the Jira summary; selecting it narrows to that PR.
    clickOption("PROJ-1: Add single sign-on");
    expect(filterCount()).toBe("1 of 3");
  });

  it("Recently Merged has no filter controls, so Open filters never carry over", () => {
    render(
      <PRsView
        openPRs={[makePR({ labels: [{ name: "bug", color: "ff0000" }] })]}
        loading={false}
        configured={false}
      />,
    );
    // Open tab shows the sidebar and its filter controls.
    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.getByText("All repos")).toBeInTheDocument();
    expect(screen.getByText("All actionable")).toBeInTheDocument();
    expect(screen.getByText("All tickets")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Recently Merged/ }));

    // Merged tab drops the sidebar entirely — no filters to inherit.
    expect(screen.queryByText("Filters")).not.toBeInTheDocument();
    expect(screen.queryByText("All repos")).not.toBeInTheDocument();
    expect(screen.queryByText("All actionable")).not.toBeInTheDocument();
    expect(screen.queryByText("All tickets")).not.toBeInTheDocument();
  });

  it("labels filter matches ALL selected labels (AND)", () => {
    render(
      <PRsView
        openPRs={[
          makePR({
            labels: [
              { name: "bug", color: "ff0000" },
              { name: "urgent", color: "00ff00" },
            ],
          }),
          makePR({ labels: [{ name: "bug", color: "ff0000" }] }),
          makePR({ labels: [] }),
        ]}
        loading={false}
        configured={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Open PRs (3)" })).toBeInTheDocument();

    // Open the Labels dropdown and select "bug" -> both bug-tagged PRs remain.
    fireEvent.click(screen.getByText("All labels"));
    clickOption("bug");
    expect(filterCount()).toBe("2 of 3");

    // Add "urgent": AND semantics leave only the PR carrying both labels.
    clickOption("urgent");
    expect(filterCount()).toBe("1 of 3");
  });

  // Locate a dropdown option row by its label (the row div carries the class;
  // its count badge, if any, lives in a child span so it doesn't affect this match).
  const optionRow = (name: string) => {
    const row = screen.getAllByText(name).find((el) => el.classList.contains("multi-select-item"));
    if (!row) throw new Error(`dropdown option "${name}" not found`);
    return row;
  };
  const optionCount = (name: string) =>
    optionRow(name).querySelector(".multi-select-count-badge")?.textContent;

  it("annotates other dropdowns with counts scoped to the current selection", () => {
    render(
      <PRsView
        openPRs={[
          makePR({ repo_full_name: "org/cmp-server", labels: [{ name: "ABC", color: "111" }] }),
          makePR({ repo_full_name: "org/cmp-server", labels: [{ name: "ABC", color: "111" }] }),
          makePR({ repo_full_name: "org/cmp-client", labels: [{ name: "ABC", color: "111" }] }),
          makePR({ repo_full_name: "org/embeddable-dam", labels: [{ name: "XYZ", color: "222" }] }),
        ]}
        loading={false}
        configured={false}
      />,
    );

    // Select the ABC label.
    fireEvent.click(screen.getByText("All labels"));
    clickOption("ABC");

    // Open Repositories: counts now reflect only the 3 ABC-labeled PRs.
    fireEvent.click(screen.getByText("All repos"));
    expect(optionCount("cmp-server")).toBe("2");
    expect(optionCount("cmp-client")).toBe("1");
  });

  it("shows zero and dims repos that have none of the selected label's PRs", () => {
    render(
      <PRsView
        openPRs={[
          makePR({ repo_full_name: "org/cmp-server", labels: [{ name: "ABC", color: "111" }] }),
          makePR({ repo_full_name: "org/embeddable-dam", labels: [{ name: "XYZ", color: "222" }] }),
        ]}
        loading={false}
        configured={false}
      />,
    );

    fireEvent.click(screen.getByText("All labels"));
    clickOption("ABC");

    fireEvent.click(screen.getByText("All repos"));
    expect(optionCount("embeddable-dam")).toBe("0");
    expect(optionRow("embeddable-dam").classList.contains("multi-select-item--empty")).toBe(true);
  });
});
