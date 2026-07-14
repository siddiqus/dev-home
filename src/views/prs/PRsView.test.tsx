import { render, screen } from "@testing-library/react";
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
