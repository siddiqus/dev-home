import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/teams", () => ({ fetchTeamMembers: vi.fn() }));
vi.mock("../../services/github", () => ({
  fetchOrgPRsMulti: vi.fn(),
  fetchRecentlyMergedPRs: vi.fn(),
  fetchOrgRepos: vi.fn(),
}));

import { fetchTeamMembers } from "../../services/teams";
import { fetchOrgPRsMulti, fetchOrgRepos, fetchRecentlyMergedPRs } from "../../services/github";
import { TeamPRsTab } from "./TeamPRsTab";
import type { GitHubPR } from "../../types";

function makePR(number: number, title: string, state = "open"): GitHubPR {
  return {
    id: number,
    number,
    title,
    html_url: `https://github.com/o/r/pull/${number}`,
    state,
    draft: false,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    user: { login: "alice", avatar_url: "" },
    head: { ref: "feature" },
    base: { ref: "main" },
    body: "",
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    in_merge_queue: false,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchTeamMembers).mockResolvedValue([
    {
      id: 1,
      team_id: 1,
      display_name: "Alice",
      jira_account_id: "a1",
      jira_email: null,
      github_username: "alice",
    },
  ]);
  vi.mocked(fetchOrgRepos).mockResolvedValue([]);
  vi.mocked(fetchOrgPRsMulti).mockResolvedValue([makePR(1, "ABC-1 open work")]);
  vi.mocked(fetchRecentlyMergedPRs).mockResolvedValue([
    makePR(2, "ABC-2 merged work", "merged"),
    makePR(3, "ABC-3 more merged work", "merged"),
  ]);
});

/** The toolbar cluster holding the Open/Merged toggle. */
const toolbar = () => screen.getByRole("tablist", { name: "PR state" }).parentElement!;

describe("TeamPRsTab", () => {
  it("keeps Collapse all in the toolbar beside the toggle on both Open and Merged", async () => {
    render(<TeamPRsTab active configured teamId={1} teamName="Origami" />);

    await waitFor(() => expect(within(toolbar()).getByText("Collapse all")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /Merged/ }));
    await screen.findByText("ABC-2 merged work");

    expect(screen.getAllByText("Collapse all")).toHaveLength(1);
    expect(within(toolbar()).getByText("Collapse all")).toBeInTheDocument();
  });

  it("collapses the merged list from the toolbar button", async () => {
    render(<TeamPRsTab active configured teamId={1} teamName="Origami" />);
    fireEvent.click(screen.getByRole("tab", { name: /Merged/ }));
    await screen.findByText("ABC-2 merged work");

    fireEvent.click(within(toolbar()).getByText("Collapse all"));
    await waitFor(() => expect(within(toolbar()).getByText("Expand all")).toBeInTheDocument());
  });
});
