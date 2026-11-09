import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePRBody, type PRBodyState } from "./usePRBody";
import { fetchPRBody, refreshPRBodyImages } from "../services/github";
import type { GitHubPR } from "../types";

vi.mock("../services/github", () => ({ fetchPRBody: vi.fn(), refreshPRBodyImages: vi.fn() }));

/** The hook's data, without its onImageError action. */
const view = ({ onImageError: _, ...data }: PRBodyState) => data;

function pr(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 7,
    title: "PR",
    html_url: "",
    state: "open",
    draft: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: "feature" },
    base: { ref: "main" },
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchPRBody).mockReset();
  vi.mocked(fetchPRBody).mockImplementation(async () => "hello");
  vi.mocked(refreshPRBodyImages).mockReset();
  vi.mocked(refreshPRBodyImages).mockReturnValue(null);
});

describe("usePRBody", () => {
  it("is idle with no PR", () => {
    const { result } = renderHook(() => usePRBody(null));
    expect(view(result.current)).toEqual({ body: "", loading: false });
    expect(fetchPRBody).not.toHaveBeenCalled();
  });

  it("uses a body the PR already carries without fetching", () => {
    const { result } = renderHook(() => usePRBody(pr({ body: "inline" })));
    expect(view(result.current)).toEqual({ body: "inline", loading: false });
    expect(fetchPRBody).not.toHaveBeenCalled();
  });

  it("lazy-loads a missing body", async () => {
    const { result } = renderHook(() => usePRBody(pr()));
    expect(view(result.current)).toEqual({ body: "", loading: true });
    await waitFor(() => expect(view(result.current)).toEqual({ body: "hello", loading: false }));
    expect(fetchPRBody).toHaveBeenCalledTimes(1);
  });

  it("settles to an empty body when the fetch fails", async () => {
    vi.mocked(fetchPRBody).mockImplementation(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => usePRBody(pr()));
    await waitFor(() => expect(view(result.current)).toEqual({ body: "", loading: false }));
  });

  describe("onImageError", () => {
    it("swaps in a refetched body when the image URLs had expired", async () => {
      vi.mocked(refreshPRBodyImages).mockReturnValue(Promise.resolve("fresh"));
      const { result } = renderHook(() => usePRBody(pr()));
      await waitFor(() => expect(view(result.current).body).toBe("hello"));
      act(() => result.current.onImageError());
      await waitFor(() => expect(view(result.current)).toEqual({ body: "fresh", loading: false }));
    });

    it("refreshes a body that came with the PR too", async () => {
      vi.mocked(refreshPRBodyImages).mockReturnValue(Promise.resolve("fresh"));
      const { result } = renderHook(() => usePRBody(pr({ body: "inline" })));
      act(() => result.current.onImageError());
      await waitFor(() => expect(view(result.current).body).toBe("fresh"));
    });

    it("keeps the body when its URLs can't have expired", async () => {
      const { result } = renderHook(() => usePRBody(pr({ body: "inline" })));
      act(() => result.current.onImageError());
      expect(refreshPRBodyImages).toHaveBeenCalledTimes(1);
      expect(view(result.current).body).toBe("inline");
    });
  });
});
