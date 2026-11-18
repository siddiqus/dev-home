import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubPR } from "../../types";
import {
  fetchOrgMembers,
  fetchOrgPRs,
  fetchOrgPRsMulti,
  fetchOrgRepos,
  fetchOrgTeams,
  fetchRecentlyMergedPRs,
  savedOrgMembers,
} from "../../services/github";
import { useOrgPRSearch } from "./useOrgPRSearch";

vi.mock("../../services/github", () => ({
  fetchOrgPRs: vi.fn(),
  fetchOrgPRsMulti: vi.fn(),
  fetchOrgMembers: vi.fn(),
  fetchOrgRepos: vi.fn(),
  fetchOrgTeams: vi.fn(),
  fetchRecentlyMergedPRs: vi.fn(),
  savedOrgMembers: vi.fn(),
  savedOrgTeams: vi.fn(() => null),
}));

const pr = (n: number) =>
  ({ number: n, html_url: `https://github.com/acme/web/pull/${n}` }) as GitHubPR;

beforeEach(() => {
  localStorage.clear();
  vi.mocked(savedOrgMembers).mockReset().mockReturnValue(null);
  vi.mocked(fetchOrgMembers)
    .mockReset()
    .mockResolvedValue([{ login: "shunjid", name: null, avatar_url: "" }]);
  vi.mocked(fetchOrgRepos)
    .mockReset()
    .mockResolvedValue([{ full_name: "acme/web", name: "web" }]);
  vi.mocked(fetchOrgTeams)
    .mockReset()
    .mockResolvedValue([{ slug: "web", name: "Web", members: ["shunjid", "tashfia", "Me"] }]);
  vi.mocked(fetchOrgPRs)
    .mockReset()
    .mockResolvedValue({ prs: [pr(1)], pageInfo: { hasNextPage: true, endCursor: "c1" } });
  vi.mocked(fetchOrgPRsMulti)
    .mockReset()
    .mockResolvedValue([pr(5), pr(6)]);
  vi.mocked(fetchRecentlyMergedPRs)
    .mockReset()
    .mockResolvedValue([pr(9)]);
});

const render = (refreshKey = 0) =>
  renderHook((props: { refreshKey: number }) => useOrgPRSearch({ configured: true, ...props }), {
    initialProps: { refreshKey },
  });

describe("useOrgPRSearch", () => {
  it("loads members and repos, but no PRs until a filter is picked", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.members).toHaveLength(1));
    expect(result.current.orgRepos).toHaveLength(1);
    expect(fetchOrgPRs).not.toHaveBeenCalled();
    expect(result.current.prs).toEqual([]);
  });

  it("flags members and repos as loading while they're fetched", async () => {
    let resolveMembers!: (v: Awaited<ReturnType<typeof fetchOrgMembers>>) => void;
    let resolveRepos!: (v: Awaited<ReturnType<typeof fetchOrgRepos>>) => void;
    vi.mocked(fetchOrgMembers).mockReturnValueOnce(new Promise((r) => (resolveMembers = r)));
    vi.mocked(fetchOrgRepos).mockReturnValueOnce(new Promise((r) => (resolveRepos = r)));

    const { result } = render();
    await waitFor(() => expect(result.current.membersLoading).toBe(true));
    expect(result.current.reposLoading).toBe(true);

    await act(async () => resolveMembers([{ login: "shunjid", name: null, avatar_url: "" }]));
    expect(result.current.membersLoading).toBe(false);
    expect(result.current.reposLoading).toBe(true);

    await act(async () => resolveRepos([{ full_name: "acme/web", name: "web" }]));
    expect(result.current.reposLoading).toBe(false);
  });

  it("doesn't flag cached members and repos as loading", () => {
    vi.mocked(savedOrgMembers).mockReturnValue([{ login: "shunjid", name: null, avatar_url: "" }]);
    localStorage.setItem(
      "dev-home-org-repos-cache",
      JSON.stringify({ data: [{ full_name: "acme/web", name: "web" }], timestamp: Date.now() }),
    );
    const { result } = render();
    expect(result.current.membersLoading).toBe(false);
    expect(result.current.reposLoading).toBe(false);
    expect(fetchOrgMembers).not.toHaveBeenCalled();
  });

  it("pages through one author's PRs", async () => {
    const { result } = render();
    act(() => result.current.setAuthors(["shunjid"]));
    await waitFor(() => expect(result.current.prs).toEqual([pr(1)]));
    expect(fetchOrgPRs).toHaveBeenCalledWith(undefined, "shunjid", undefined, "");
    expect(result.current.hasNextPage).toBe(true);

    vi.mocked(fetchOrgPRs).mockResolvedValueOnce({
      prs: [pr(2)],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    await act(() => result.current.fetchNextPage());
    expect(fetchOrgPRs).toHaveBeenLastCalledWith("c1", "shunjid", undefined, "");
    expect(result.current.prs).toEqual([pr(1), pr(2)]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("searches several authors at once, without paging", async () => {
    const { result } = render();
    act(() => result.current.setAuthors(["a", "b"]));
    await waitFor(() => expect(result.current.prs).toEqual([pr(5), pr(6)]));
    expect(fetchOrgPRsMulti).toHaveBeenCalledWith(["a", "b"], [], "");
    expect(result.current.isMultiMode).toBe(true);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("loads the filter's recently merged PRs", async () => {
    const { result } = render();
    act(() => result.current.setSelectedRepos(["acme/web"]));
    await waitFor(() => expect(result.current.mergedPRs).toEqual([pr(9)]));
    expect(fetchRecentlyMergedPRs).toHaveBeenCalledWith("org", [], ["acme/web"], {
      force: false,
      text: "",
    });
  });

  it("reloads open and merged PRs when refreshKey changes", async () => {
    const { result, rerender } = render();
    act(() => result.current.setAuthors(["shunjid"]));
    await waitFor(() => expect(result.current.prs).toEqual([pr(1)]));
    vi.mocked(fetchOrgPRs).mockClear();
    vi.mocked(fetchRecentlyMergedPRs).mockClear();

    rerender({ refreshKey: 1 });

    await waitFor(() => expect(fetchOrgPRs).toHaveBeenCalledTimes(1));
    expect(fetchRecentlyMergedPRs).toHaveBeenCalledWith("org", ["shunjid"], [], {
      force: true,
      text: "",
    });
  });

  it("remembers whether Open or Merged was picked", () => {
    const { result } = render();
    expect(result.current.subTab).toBe("open");
    act(() => result.current.setSubTab("merged"));
    expect(result.current.subTab).toBe("merged");
    expect(localStorage.getItem("dev-home-org-prs-subtab")).toBe("merged");
  });

  it("searches a picked team as its members, with any people picked beside it", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.teams).toHaveLength(1));
    act(() => result.current.setAuthors(["team:web", "me", "shunjid"]));
    await waitFor(() => expect(fetchOrgPRsMulti).toHaveBeenCalled());
    // Repeats (any case) dropped; first appearance kept.
    expect(fetchOrgPRsMulti).toHaveBeenLastCalledWith(["shunjid", "tashfia", "Me"], [], "");
    await waitFor(() =>
      expect(fetchRecentlyMergedPRs).toHaveBeenLastCalledWith(
        "org",
        ["shunjid", "tashfia", "Me"],
        [],
        { force: false, text: "" },
      ),
    );
    expect(result.current.isMultiMode).toBe(true);
  });

  it("waits for the teams list before searching a remembered team pick", async () => {
    let resolveTeams!: (v: Awaited<ReturnType<typeof fetchOrgTeams>>) => void;
    vi.mocked(fetchOrgTeams).mockReturnValueOnce(new Promise((r) => (resolveTeams = r)));
    const { result } = render();
    act(() => result.current.setAuthors(["team:web"]));
    await act(async () => {});
    expect(fetchOrgPRsMulti).not.toHaveBeenCalled();
    expect(fetchOrgPRs).not.toHaveBeenCalled();

    await act(async () => resolveTeams([{ slug: "web", name: "Web", members: ["a", "b"] }]));
    await waitFor(() => expect(fetchOrgPRsMulti).toHaveBeenCalledWith(["a", "b"], [], ""));
  });

  it("searches the whole org by text alone, open and any-time merged, and pages by it", async () => {
    const { result } = render();
    act(() => result.current.setQuery("  token refresh "));
    expect(result.current.query).toBe("token refresh");
    await waitFor(() => expect(result.current.prs).toEqual([pr(1)]));
    expect(fetchOrgPRs).toHaveBeenCalledWith(undefined, undefined, undefined, "token refresh");
    await waitFor(() => expect(result.current.mergedPRs).toEqual([pr(9)]));
    expect(fetchRecentlyMergedPRs).toHaveBeenCalledWith("org", [], [], {
      force: false,
      text: "token refresh",
    });

    await act(() => result.current.fetchNextPage());
    expect(fetchOrgPRs).toHaveBeenLastCalledWith("c1", undefined, undefined, "token refresh");
  });

  it("narrows picked authors by the text", async () => {
    const { result } = render();
    act(() => result.current.setAuthors(["a", "b"]));
    await waitFor(() => expect(fetchOrgPRsMulti).toHaveBeenCalledTimes(1));
    act(() => result.current.setQuery("label:bug"));
    await waitFor(() =>
      expect(fetchOrgPRsMulti).toHaveBeenLastCalledWith(["a", "b"], [], "label:bug"),
    );
  });

  it("goes back to nothing once the text is cleared with nothing picked", async () => {
    const { result } = render();
    act(() => result.current.setQuery("token"));
    await waitFor(() => expect(result.current.prs).toEqual([pr(1)]));
    act(() => result.current.setQuery(""));
    await waitFor(() => expect(result.current.prs).toEqual([]));
    expect(result.current.mergedPRs).toEqual([]);
    expect(fetchOrgPRs).toHaveBeenCalledTimes(1);
  });

  it("doesn't keep results found by text for the next visit", async () => {
    const { result, unmount } = render();
    act(() => result.current.setAuthors(["shunjid"]));
    await waitFor(() => expect(result.current.prs).toEqual([pr(1)]));
    vi.mocked(fetchOrgPRs).mockResolvedValue({
      prs: [pr(3)],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    act(() => result.current.setQuery("token"));
    await waitFor(() => expect(result.current.prs).toEqual([pr(3)]));
    unmount();

    const next = render();
    expect(next.result.current.query).toBe("");
    expect(next.result.current.authors).toEqual(["shunjid"]);
    expect(next.result.current.prs).toEqual([pr(1)]);
  });

  it("searches nothing for a team with no one in it, rather than the whole org", async () => {
    vi.mocked(fetchOrgTeams).mockResolvedValue([{ slug: "empty", name: "Empty", members: [] }]);
    const { result } = render();
    await waitFor(() => expect(result.current.teams).toHaveLength(1));
    act(() => {
      result.current.setAuthors(["team:empty"]);
      result.current.setSelectedRepos(["acme/web"]);
    });
    await act(async () => {});
    expect(fetchOrgPRs).not.toHaveBeenCalled();
    expect(fetchOrgPRsMulti).not.toHaveBeenCalled();
    expect(result.current.prs).toEqual([]);
  });
});
