import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubPR } from "../../types";
import { ViewerLoginContext } from "../../context/ViewerLoginContext";
import { useOrgPRSearch } from "./useOrgPRSearch";
import { PhonePRSearch } from "./PhonePRSearch";

vi.mock("./useOrgPRSearch", () => ({ useOrgPRSearch: vi.fn() }));
vi.mock("../../utils/commentCounts", () => ({ commentCounts: () => null }));
vi.mock("../../services/commentsRead", () => ({ useCommentsReadAt: () => null }));
vi.mock("../../components/PRDetailModal", () => ({
  PRDetailModal: ({ pr }: { pr: GitHubPR | null }) =>
    pr ? <div role="dialog">PR modal: {pr.title}</div> : null,
}));

// The filter sheets are Offcanvas, which checks a responsive breakpoint; jsdom has no matchMedia.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const pr = (n: number, login: string, over: Partial<GitHubPR> = {}): GitHubPR =>
  ({
    id: n,
    number: n,
    title: `WMU-${n} Change ${n}`,
    html_url: `https://github.com/acme/cmp-server/pull/${n}`,
    state: "open",
    draft: false,
    created_at: "2026-10-29T12:00:00Z",
    updated_at: "2026-10-31T10:00:00Z",
    user: { login, avatar_url: "" },
    head: { ref: `b-${n}`, sha: "abc" },
    base: { ref: "main" },
    repo_full_name: "acme/cmp-server",
    checks_status: "SUCCESS",
    checks: [],
    review_status: "REVIEW_REQUIRED",
    requested_reviewers: [],
    ...over,
  }) as GitHubPR;

type Search = ReturnType<typeof useOrgPRSearch>;

function search(over: Partial<Search> = {}): Search {
  return {
    prs: [],
    loading: false,
    loadingMore: false,
    hasNextPage: false,
    isMultiMode: false,
    fetchNextPage: vi.fn(),
    mergedPRs: [],
    mergedPRsLoading: false,
    authors: [],
    setAuthors: vi.fn(),
    selectedRepos: [],
    setSelectedRepos: vi.fn(),
    members: [
      { login: "shunjid", avatar_url: "" },
      { login: "tashfia", avatar_url: "" },
      { login: "me", avatar_url: "" },
    ],
    orgRepos: [
      { full_name: "acme/cmp-server", name: "cmp-server" },
      { full_name: "acme/cmp-web", name: "cmp-web" },
    ],
    subTab: "open",
    setSubTab: vi.fn(),
    refreshPRs: vi.fn(),
    refreshMembers: vi.fn(),
    refreshRepos: vi.fn(),
    refreshAll: vi.fn(),
    ...over,
  } as Search;
}

function renderPage(s: Search, onLoadingChange = vi.fn()) {
  vi.mocked(useOrgPRSearch).mockReturnValue(s);
  render(
    <ViewerLoginContext.Provider value="me">
      <PhonePRSearch configured jiraBaseUrl="" onLoadingChange={onLoadingChange} />
    </ViewerLoginContext.Provider>,
  );
  return { onLoadingChange };
}

beforeEach(() => vi.mocked(useOrgPRSearch).mockReset());

describe("PhonePRSearch", () => {
  it("asks for authors or repos until one is picked", () => {
    renderPage(search());
    expect(screen.getByRole("heading", { name: "PR search" })).toBeInTheDocument();
    expect(screen.getByText("Pick authors or repos to search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Authors: Anyone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repos: All repos" })).toBeInTheDocument();
  });

  it("names the picks on the chips", () => {
    renderPage(
      search({ authors: ["shunjid"], selectedRepos: ["acme/cmp-server", "acme/cmp-web"] }),
    );
    expect(screen.getByRole("button", { name: "Authors: shunjid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repos: 2 repos" })).toBeInTheDocument();
    renderPage(search({ authors: ["a", "b", "c"], selectedRepos: ["acme/cmp-web"] }));
    expect(screen.getByRole("button", { name: "Authors: 3 authors" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repos: cmp-web" })).toBeInTheDocument();
  });

  it("picks authors in a sheet with a search box", () => {
    const s = search({ authors: ["tashfia"] });
    renderPage(s);
    fireEvent.click(screen.getByRole("button", { name: /^Authors:/ }));
    const sheet = screen.getByRole("dialog", { name: "Authors" });

    fireEvent.change(within(sheet).getByPlaceholderText("Search people…"), {
      target: { value: "shun" },
    });
    expect(within(sheet).queryByRole("checkbox", { name: "tashfia" })).toBeNull();
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "shunjid" }));

    expect(s.setAuthors).toHaveBeenCalledWith(["tashfia", "shunjid"]);
  });

  it("unpicks a repo from its sheet", () => {
    const s = search({ selectedRepos: ["acme/cmp-web"] });
    renderPage(s);
    fireEvent.click(screen.getByRole("button", { name: /^Repos:/ }));
    const sheet = screen.getByRole("dialog", { name: "Repos" });
    expect(within(sheet).getByRole("checkbox", { name: "cmp-web" })).toBeChecked();
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "cmp-web" }));
    expect(s.setSelectedRepos).toHaveBeenCalledWith([]);
  });

  it("lists open PRs as Workday cards, with every author shown", () => {
    renderPage(search({ authors: ["shunjid", "me"], prs: [pr(1, "shunjid"), pr(2, "me")] }));
    expect(screen.getByText("Showing 2 recent PRs")).toBeInTheDocument();
    const list = screen.getByRole("listbox", { name: "Pull requests" });
    const cards = within(list).getAllByRole("option");
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector(".deck-pr-author")).toHaveTextContent("shunjid");
    // My own PR keeps its author here, unlike on Workday.
    expect(cards[1].querySelector(".deck-pr-author")).toHaveTextContent("me");
  });

  it("loads more when there's another page", () => {
    const s = search({ authors: ["shunjid"], prs: [pr(1, "shunjid")], hasNextPage: true });
    renderPage(s);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(s.fetchNextPage).toHaveBeenCalled();
  });

  it("shows merged PRs on Merged, each saying when it merged", () => {
    renderPage(
      search({
        authors: ["shunjid"],
        subTab: "merged",
        mergedPRs: [
          pr(3, "shunjid", {
            state: "merged",
            merged_at: "2026-10-30T12:00:00Z",
            merged_by: "tashfia",
          }),
        ],
      }),
    );
    expect(screen.getByText("Showing 1 recently merged PR")).toBeInTheDocument();
    expect(screen.getByText(/^Merged .* by tashfia$/)).toBeInTheDocument();
  });

  it("switches between Open and Merged", () => {
    const s = search();
    renderPage(s);
    fireEvent.click(screen.getByRole("button", { name: "Merged" }));
    expect(s.setSubTab).toHaveBeenCalledWith("merged");
  });

  it("opens the PR modal from a card", () => {
    renderPage(search({ authors: ["shunjid"], prs: [pr(1, "shunjid")] }));
    fireEvent.click(screen.getByText("WMU-1 Change 1"));
    expect(screen.getByRole("dialog")).toHaveTextContent("PR modal: WMU-1 Change 1");
  });

  it("tells the app when it's loading, for the pull-to-refresh spinner", () => {
    const { onLoadingChange } = renderPage(search({ authors: ["shunjid"], loading: true }));
    expect(onLoadingChange).toHaveBeenLastCalledWith(true);
  });
});
