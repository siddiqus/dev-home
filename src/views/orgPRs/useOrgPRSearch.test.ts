import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubPR } from "../../types";
import {
  fetchOrgMembers,
  fetchOrgPRs,
  fetchOrgPRsMulti,
  fetchOrgRepos,
  fetchRecentlyMergedPRs,
} from "../../services/github";
import { useOrgPRSearch } from "./useOrgPRSearch";

vi.mock("../../services/github", () => ({
  fetchOrgPRs: vi.fn(),
  fetchOrgPRsMulti: vi.fn(),
  fetchOrgMembers: vi.fn(),
  fetchOrgRepos: vi.fn(),
  fetchRecentlyMergedPRs: vi.fn(),
}));

const pr = (n: number) =>
  ({ number: n, html_url: `https://github.com/acme/web/pull/${n}` }) as GitHubPR;

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchOrgMembers)
    .mockReset()
    .mockResolvedValue([{ login: "shunjid", avatar_url: "" }]);
  vi.mocked(fetchOrgRepos)
    .mockReset()
    .mockResolvedValue([{ full_name: "acme/web", name: "web" }]);
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

  it("pages through one author's PRs", async () => {
    const { result } = render();
    act(() => result.current.setAuthors(["shunjid"]));
    await waitFor(() => expect(result.current.prs).toEqual([pr(1)]));
    expect(fetchOrgPRs).toHaveBeenCalledWith(undefined, "shunjid", undefined);
    expect(result.current.hasNextPage).toBe(true);

    vi.mocked(fetchOrgPRs).mockResolvedValueOnce({
      prs: [pr(2)],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    await act(() => result.current.fetchNextPage());
    expect(fetchOrgPRs).toHaveBeenLastCalledWith("c1", "shunjid", undefined);
    expect(result.current.prs).toEqual([pr(1), pr(2)]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("searches several authors at once, without paging", async () => {
    const { result } = render();
    act(() => result.current.setAuthors(["a", "b"]));
    await waitFor(() => expect(result.current.prs).toEqual([pr(5), pr(6)]));
    expect(fetchOrgPRsMulti).toHaveBeenCalledWith(["a", "b"], []);
    expect(result.current.isMultiMode).toBe(true);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("loads the filter's recently merged PRs", async () => {
    const { result } = render();
    act(() => result.current.setSelectedRepos(["acme/web"]));
    await waitFor(() => expect(result.current.mergedPRs).toEqual([pr(9)]));
    expect(fetchRecentlyMergedPRs).toHaveBeenCalledWith("org", [], ["acme/web"], { force: false });
  });

  it("reloads open and merged PRs when refreshKey changes", async () => {
    const { result, rerender } = render();
    act(() => result.current.setAuthors(["shunjid"]));
    await waitFor(() => expect(result.current.prs).toEqual([pr(1)]));
    vi.mocked(fetchOrgPRs).mockClear();
    vi.mocked(fetchRecentlyMergedPRs).mockClear();

    rerender({ refreshKey: 1 });

    await waitFor(() => expect(fetchOrgPRs).toHaveBeenCalledTimes(1));
    expect(fetchRecentlyMergedPRs).toHaveBeenCalledWith("org", ["shunjid"], [], { force: true });
  });

  it("remembers whether Open or Merged was picked", () => {
    const { result } = render();
    expect(result.current.subTab).toBe("open");
    act(() => result.current.setSubTab("merged"));
    expect(result.current.subTab).toBe("merged");
    expect(localStorage.getItem("dev-home-org-prs-subtab")).toBe("merged");
  });
});
