import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePRComments, type PRCommentsState } from "./usePRComments";
import { fetchPRComments, setPRThreadResolved } from "../services/github";
import type { GitHubPR, PRComments, PRReviewThread } from "../types";

vi.mock("../services/github", async () => ({
  fetchPRComments: vi.fn(),
  setPRThreadResolved: vi.fn(),
  withThreadStatus: (await import("../api/github/prComments")).withThreadStatus,
}));

/** The hook's data, without its setThreadResolved action. */
const view = ({ setThreadResolved: _, ...data }: PRCommentsState) => data;

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

const comments = (truncated = false): PRComments => ({ threads: [], conversation: [], truncated });
const COMMENTS = comments();
const IDLE = { comments: null, loading: false, error: false };
const LOADING = { comments: null, loading: true, error: false };

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(fetchPRComments).mockReset();
  vi.mocked(fetchPRComments).mockImplementation(async () => COMMENTS);
  vi.mocked(setPRThreadResolved).mockReset();
});

describe("usePRComments", () => {
  it("is idle with no PR", () => {
    const { result } = renderHook(() => usePRComments(null, true));
    expect(view(result.current)).toEqual(IDLE);
    expect(fetchPRComments).not.toHaveBeenCalled();
  });

  it("doesn't fetch while disabled", () => {
    const { result } = renderHook(() => usePRComments(pr(), false));
    expect(view(result.current)).toEqual(IDLE);
    expect(fetchPRComments).not.toHaveBeenCalled();
  });

  it("fetches once enabled", async () => {
    const { result } = renderHook(() => usePRComments(pr(), true));
    expect(view(result.current)).toEqual(LOADING);
    await waitFor(() =>
      expect(view(result.current)).toEqual({ comments: COMMENTS, loading: false, error: false }),
    );
    expect(fetchPRComments).toHaveBeenCalledTimes(1);
  });

  it("keeps a loaded result when disabled again", async () => {
    const { result, rerender } = renderHook(({ enabled }) => usePRComments(pr(), enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.comments).toBe(COMMENTS));
    rerender({ enabled: false });
    expect(view(result.current)).toEqual({ comments: COMMENTS, loading: false, error: false });
    rerender({ enabled: true });
    expect(view(result.current)).toEqual({ comments: COMMENTS, loading: false, error: false });
  });

  it("settles after being disabled and re-enabled mid-fetch", async () => {
    const pending = deferred<PRComments>();
    vi.mocked(fetchPRComments).mockImplementation(() => pending.promise);
    const { result, rerender } = renderHook(({ enabled }) => usePRComments(pr(), enabled), {
      initialProps: { enabled: true },
    });
    expect(view(result.current)).toEqual(LOADING);
    rerender({ enabled: false });
    expect(view(result.current)).toEqual(IDLE);
    rerender({ enabled: true });
    expect(view(result.current)).toEqual(LOADING);
    await act(async () => pending.resolve(COMMENTS));
    expect(view(result.current)).toEqual({ comments: COMMENTS, loading: false, error: false });
  });

  it("reports a failed fetch", async () => {
    vi.mocked(fetchPRComments).mockImplementation(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => usePRComments(pr(), true));
    await waitFor(() => expect(view(result.current)).toEqual({ ...IDLE, error: true }));
  });

  it("refetches for another PR or a newer update", async () => {
    const { result, rerender } = renderHook(({ p }) => usePRComments(p, true), {
      initialProps: { p: pr() },
    });
    await waitFor(() => expect(result.current.comments).toBe(COMMENTS));

    const updated = comments(true);
    vi.mocked(fetchPRComments).mockImplementation(async () => updated);
    rerender({ p: pr({ updated_at: "2026-09-03T00:00:00Z" }) });
    expect(view(result.current)).toEqual(LOADING);
    await waitFor(() => expect(result.current.comments).toBe(updated));

    rerender({ p: pr({ number: 8 }) });
    expect(view(result.current)).toEqual(LOADING);
    await waitFor(() => expect(result.current.comments).toBe(updated));
    expect(fetchPRComments).toHaveBeenCalledTimes(3);
  });

  it("never shows a stale response for the previous PR", async () => {
    const first = deferred<PRComments>();
    const second = deferred<PRComments>();
    vi.mocked(fetchPRComments)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result, rerender } = renderHook(({ p }) => usePRComments(p, true), {
      initialProps: { p: pr() },
    });
    rerender({ p: pr({ number: 8 }) });

    await act(async () => first.resolve(comments()));
    expect(view(result.current)).toEqual(LOADING);

    const fresh = comments(true);
    await act(async () => second.resolve(fresh));
    expect(view(result.current)).toEqual({ comments: fresh, loading: false, error: false });
  });
});

describe("usePRComments setThreadResolved", () => {
  const thread = (o: Partial<PRReviewThread> = {}): PRReviewThread => ({
    id: "t1",
    path: "a.ts",
    line: 1,
    state: "open",
    hunk: [],
    comments: [],
    html_url: "",
    can_resolve: true,
    can_unresolve: false,
    ...o,
  });
  const withThread = (t: PRReviewThread): PRComments => ({ ...COMMENTS, threads: [t] });
  const stateOf = (r: { current: PRCommentsState }) => r.current.comments?.threads[0].state;

  async function loaded(t: PRReviewThread = thread()) {
    vi.mocked(fetchPRComments).mockImplementation(async () => withThread(t));
    const hook = renderHook(() => usePRComments(pr(), true));
    await waitFor(() => expect(hook.result.current.comments).not.toBeNull());
    return hook;
  }

  it("resolves at once, then takes GitHub's answer", async () => {
    const answer = deferred<{ state: "resolved"; can_resolve: false; can_unresolve: true }>();
    vi.mocked(setPRThreadResolved).mockReturnValue(answer.promise);
    const { result } = await loaded();
    let done!: Promise<void>;
    act(() => {
      done = result.current.setThreadResolved("t1", true);
    });
    expect(stateOf(result)).toBe("resolved");
    expect(setPRThreadResolved).not.toHaveBeenCalled();
    await waitFor(() => expect(setPRThreadResolved).toHaveBeenCalledWith(pr(), "t1", true));
    await act(async () => {
      answer.resolve({ state: "resolved", can_resolve: false, can_unresolve: true });
      await done;
    });
    expect(result.current.comments?.threads[0]).toMatchObject({
      state: "resolved",
      can_resolve: false,
      can_unresolve: true,
    });
  });

  it("shows an unresolved thread as open until GitHub says it's outdated", async () => {
    const answer = deferred<{ state: "outdated"; can_resolve: true; can_unresolve: false }>();
    vi.mocked(setPRThreadResolved).mockReturnValue(answer.promise);
    const { result } = await loaded(
      thread({ state: "resolved", can_resolve: false, can_unresolve: true }),
    );
    let done!: Promise<void>;
    act(() => {
      done = result.current.setThreadResolved("t1", false);
    });
    expect(stateOf(result)).toBe("open");
    await act(async () => {
      answer.resolve({ state: "outdated", can_resolve: true, can_unresolve: false });
      await done;
    });
    expect(stateOf(result)).toBe("outdated");
  });

  it("reverts and rejects when GitHub refuses", async () => {
    vi.mocked(setPRThreadResolved).mockRejectedValue(new Error("no permission"));
    const { result } = await loaded();
    let done!: Promise<void>;
    act(() => {
      done = result.current.setThreadResolved("t1", true);
    });
    expect(stateOf(result)).toBe("resolved");
    await act(async () => {
      await expect(done).rejects.toThrow("no permission");
    });
    expect(result.current.comments?.threads[0]).toMatchObject({
      state: "open",
      can_resolve: true,
      can_unresolve: false,
    });
  });

  it("sends an Undo only after the Resolve it undoes", async () => {
    const first = deferred<{ state: "resolved"; can_resolve: false; can_unresolve: true }>();
    vi.mocked(setPRThreadResolved)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ state: "open", can_resolve: true, can_unresolve: false });
    const { result } = await loaded();
    let undo!: Promise<void>;
    act(() => {
      void result.current.setThreadResolved("t1", true);
    });
    act(() => {
      undo = result.current.setThreadResolved("t1", false);
    });
    expect(stateOf(result)).toBe("open");
    await waitFor(() => expect(setPRThreadResolved).toHaveBeenCalledTimes(1));
    await act(async () => {
      first.resolve({ state: "resolved", can_resolve: false, can_unresolve: true });
      await undo;
    });
    expect(vi.mocked(setPRThreadResolved).mock.calls.map((c) => c[2])).toEqual([true, false]);
    expect(stateOf(result)).toBe("open");
  });
});
