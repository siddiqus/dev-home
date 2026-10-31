import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubPR } from "../../types";
import { fetchOrgPRsMulti, fetchRecentlyMergedPRs } from "../../services/github";
import { fetchSavedFilters } from "../../services/filters";
import { writeCached } from "../../lib/ttlCache";
import { OrgPRsView } from "./OrgPRsView";

vi.mock("../../services/github", () => ({
  fetchOrgPRs: vi.fn(),
  fetchOrgPRsMulti: vi.fn(),
  fetchOrgMembers: vi.fn().mockResolvedValue([]),
  fetchOrgRepos: vi.fn().mockResolvedValue([]),
  fetchRecentlyMergedPRs: vi.fn(),
}));
vi.mock("../../services/filters", () => ({
  fetchSavedFilters: vi.fn(),
  createSavedFilter: vi.fn(),
  updateSavedFilter: vi.fn(),
  deleteSavedFilter: vi.fn(),
}));
// The table's rows aren't under test here; it shows the titles it's given.
vi.mock("../../components/PRTable", async () => {
  const { forwardRef } = await import("react");
  return {
    PRTable: forwardRef(({ prs }: { prs: GitHubPR[] }, _ref) => (
      <ul>
        {prs.map((p) => (
          <li key={p.number}>{p.title}</li>
        ))}
      </ul>
    )),
  };
});

const pr = (n: number, title: string) => ({ number: n, title }) as GitHubPR;

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchSavedFilters).mockReset().mockResolvedValue([]);
  vi.mocked(fetchRecentlyMergedPRs).mockReset().mockResolvedValue([]);
  vi.mocked(fetchOrgPRsMulti)
    .mockReset()
    .mockResolvedValue([pr(5, "Team PR")]);
});

describe("OrgPRsView (desktop All PRs)", () => {
  it("asks for a filter until one is picked", () => {
    render(<OrgPRsView configured jiraBaseUrl="" />);
    expect(screen.getByText("Select a filter to view PRs")).toBeInTheDocument();
  });

  it("shows the cached results for the last filter", () => {
    writeCached("dev-home-org-prs-cache-v2", {
      data: {
        prs: [pr(1, "Cached PR")],
        hasNextPage: false,
        endCursor: null,
        authors: ["shunjid"],
        repos: [],
      },
    });
    render(<OrgPRsView configured jiraBaseUrl="" />);
    expect(screen.getByText("Cached PR")).toBeInTheDocument();
    expect(screen.getByText("Open PRs (1)")).toBeInTheDocument();
  });

  it("applies a saved filter's authors and repos", async () => {
    vi.mocked(fetchSavedFilters).mockResolvedValue([
      {
        id: 1,
        name: "My team",
        filter_config: { authors: ["a", "b"], repos: [] },
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
      },
    ] as Awaited<ReturnType<typeof fetchSavedFilters>>);
    render(<OrgPRsView configured jiraBaseUrl="" />);

    fireEvent.click(await screen.findByRole("button", { name: /Saved Filters/ }));
    fireEvent.mouseDown(screen.getByText("My team"));

    await waitFor(() => expect(fetchOrgPRsMulti).toHaveBeenCalledWith(["a", "b"], []));
    expect(await screen.findByText("Team PR")).toBeInTheDocument();
  });
});
