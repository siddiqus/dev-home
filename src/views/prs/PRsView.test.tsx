import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { PRsView } from "./PRsView";
import type { GitHubPR } from "../../types";

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

  it("'CI failure only' narrows to PRs with a red check-rollup status", () => {
    render(
      <PRsView
        openPRs={[
          makePR({ checks_status: "FAILURE" }),
          makePR({ checks_status: "SUCCESS" }),
          makePR({ checks_status: null }),
        ]}
        loading={false}
        configured={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Open PRs (3)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));

    expect(screen.getByRole("button", { name: "Open PRs (1)" })).toBeInTheDocument();
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

    // The label name also appears on PR-card chips, so scope clicks to the
    // dropdown's own option rows (class "multi-select-item").
    const clickOption = (name: string) => {
      const option = screen
        .getAllByText(name)
        .find((el) => el.classList.contains("multi-select-item"));
      if (!option) throw new Error(`dropdown option "${name}" not found`);
      fireEvent.mouseDown(option);
    };

    // Open the Labels dropdown and select "bug" -> both bug-tagged PRs remain.
    fireEvent.click(screen.getByText("All labels"));
    clickOption("bug");
    expect(screen.getByRole("button", { name: "Open PRs (2)" })).toBeInTheDocument();

    // Add "urgent": AND semantics leave only the PR carrying both labels.
    clickOption("urgent");
    expect(screen.getByRole("button", { name: "Open PRs (1)" })).toBeInTheDocument();
  });
});
