import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePRBody } from "./usePRBody";
import { fetchPRBody } from "../services/github";
import type { GitHubPR } from "../types";

vi.mock("../services/github", () => ({ fetchPRBody: vi.fn() }));

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
});

describe("usePRBody", () => {
  it("is idle with no PR", () => {
    const { result } = renderHook(() => usePRBody(null));
    expect(result.current).toEqual({ body: "", loading: false });
    expect(fetchPRBody).not.toHaveBeenCalled();
  });

  it("uses a body the PR already carries without fetching", () => {
    const { result } = renderHook(() => usePRBody(pr({ body: "inline" })));
    expect(result.current).toEqual({ body: "inline", loading: false });
    expect(fetchPRBody).not.toHaveBeenCalled();
  });

  it("lazy-loads a missing body", async () => {
    const { result } = renderHook(() => usePRBody(pr()));
    expect(result.current).toEqual({ body: "", loading: true });
    await waitFor(() => expect(result.current).toEqual({ body: "hello", loading: false }));
    expect(fetchPRBody).toHaveBeenCalledTimes(1);
  });

  it("settles to an empty body when the fetch fails", async () => {
    vi.mocked(fetchPRBody).mockImplementation(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => usePRBody(pr()));
    await waitFor(() => expect(result.current).toEqual({ body: "", loading: false }));
  });
});
