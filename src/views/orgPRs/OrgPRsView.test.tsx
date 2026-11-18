import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubPR } from "../../types";
import {
  fetchOrgPRs,
  fetchOrgPRsMulti,
  fetchPR,
  fetchRecentlyMergedPRs,
} from "../../services/github";
import { fetchSavedFilters } from "../../services/filters";
import { writeCached } from "../../lib/ttlCache";
import { OrgPRsView } from "./OrgPRsView";

vi.mock("../../services/github", () => ({
  fetchOrgPRs: vi.fn(),
  fetchOrgPRsMulti: vi.fn(),
  fetchOrgMembers: vi.fn().mockResolvedValue([]),
  fetchOrgTeams: vi.fn().mockResolvedValue([]),
  fetchOrgRepos: vi.fn().mockResolvedValue([]),
  fetchRecentlyMergedPRs: vi.fn(),
  fetchPR: vi.fn(),
  savedOrgMembers: vi.fn(() => null),
  savedOrgTeams: vi.fn(() => null),
}));
vi.mock("../../services/filters", () => ({
  fetchSavedFilters: vi.fn(),
  createSavedFilter: vi.fn(),
  updateSavedFilter: vi.fn(),
  deleteSavedFilter: vi.fn(),
}));
// The table's rows aren't under test here; it shows the titles it's given, or its empty title.
vi.mock("../../components/PRTable", async () => {
  const { forwardRef } = await import("react");
  return {
    PRTable: forwardRef(({ prs, empty }: { prs: GitHubPR[]; empty?: { title: string } }, _ref) =>
      prs.length === 0 && empty ? (
        <p>{empty.title}</p>
      ) : (
        <ul>
          {prs.map((p) => (
            <li key={p.number}>{p.title}</li>
          ))}
        </ul>
      ),
    ),
  };
});
vi.mock("../../components/PRDetailModal", () => ({
  PRDetailModal: ({ pr }: { pr: GitHubPR | null }) =>
    pr ? <div role="dialog">PR modal: {pr.title}</div> : null,
}));

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
  it("asks for a search or a filter until there is one", () => {
    render(<OrgPRsView configured jiraBaseUrl="" />);
    expect(screen.getByText("Search, or pick a filter")).toBeInTheDocument();
  });

  const box = () => screen.getByRole("textbox", { name: "Search PRs or paste a link…" });

  it("searches the whole org by the text typed above the toolbar", async () => {
    vi.mocked(fetchOrgPRs).mockResolvedValue({
      prs: [pr(3, "Fix token refresh")],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    render(<OrgPRsView configured jiraBaseUrl="" />);
    fireEvent.change(box(), { target: { value: "token" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(await screen.findByText("Fix token refresh")).toBeInTheDocument();
    expect(fetchOrgPRs).toHaveBeenCalledWith(undefined, undefined, undefined, "token");
  });

  it("says when nothing matches the text", async () => {
    vi.mocked(fetchOrgPRs).mockResolvedValue({
      prs: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    render(<OrgPRsView configured jiraBaseUrl="" />);
    fireEvent.change(box(), { target: { value: "tokn" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(await screen.findByText('No open PRs match "tokn"')).toBeInTheDocument();
  });

  it("jumps to the search box on /, but not while typing elsewhere", () => {
    render(
      <>
        <input aria-label="elsewhere" />
        <OrgPRsView configured jiraBaseUrl="" />
      </>,
    );
    const other = screen.getByRole("textbox", { name: "elsewhere" });
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(other).toHaveFocus();

    other.blur();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(box()).toHaveFocus();
  });

  it("opens a pasted PR link in the PR modal", async () => {
    vi.mocked(fetchPR).mockResolvedValue(pr(812, "Fix token refresh"));
    render(<OrgPRsView configured jiraBaseUrl="" />);
    fireEvent.paste(box());
    fireEvent.change(box(), { target: { value: "github.com/acme/api/pull/812" } });
    await act(async () => {});
    expect(fetchPR).toHaveBeenCalledWith("acme", "api", 812);
    expect(screen.getByRole("dialog")).toHaveTextContent("PR modal: Fix token refresh");
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

    await waitFor(() => expect(fetchOrgPRsMulti).toHaveBeenCalledWith(["a", "b"], [], ""));
    expect(await screen.findByText("Team PR")).toBeInTheDocument();
  });
});
