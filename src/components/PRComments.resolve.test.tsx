import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PRComments } from "./PRComments";
import { usePRComments } from "../hooks/usePRComments";
import { fetchPRComments, setPRThreadResolved } from "../services/github";
import type { GitHubPR, PRComments as PRCommentsData, PRThreadStatus } from "../types";

// Resolving end to end: the real hook and view, with only GitHub mocked.

vi.mock("./Markdown", () => ({
  Markdown: ({ children }: { children: string }) => <div className="markdown-body">{children}</div>,
}));

vi.mock("../services/github", async () => ({
  fetchPRComments: vi.fn(),
  setPRThreadResolved: vi.fn(),
  withThreadStatus: (await import("../api/github/prComments")).withThreadStatus,
}));

const pr = {
  id: 1,
  number: 42,
  title: "Retry uploads",
  html_url: "https://github.com/o/r/pull/42",
  state: "open",
  draft: false,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  user: { login: "sabbir", avatar_url: "" },
  head: { ref: "feature" },
  base: { ref: "main" },
  repo_full_name: "o/r",
  checks_status: null,
  checks: [],
  review_status: null,
} as GitHubPR;

const COMMENTS: PRCommentsData = {
  threads: [
    {
      id: "t1",
      path: "src/a.ts",
      line: 3,
      state: "open",
      hunk: [],
      comments: [
        {
          id: 1,
          author: { login: "alice", avatar_url: "", is_bot: false },
          body: "Rename x",
          created_at: "2026-10-01T00:00:00Z",
          html_url: "https://github.com/o/r/pull/42#discussion_r1",
        },
      ],
      html_url: "https://github.com/o/r/pull/42#discussion_r1",
      can_resolve: true,
      can_unresolve: false,
    },
  ],
  conversation: [],
  truncated: false,
};

const RESOLVED: PRThreadStatus = { state: "resolved", can_resolve: false, can_unresolve: true };
const OPEN: PRThreadStatus = { state: "open", can_resolve: true, can_unresolve: false };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Harness() {
  return <PRComments pr={pr} layout="desktop" {...usePRComments(pr, true)} />;
}

const isOpen = () => !!screen.queryByRole("button", { name: "Resolve" });

beforeEach(() => {
  vi.mocked(fetchPRComments).mockReset();
  vi.mocked(fetchPRComments).mockResolvedValue(COMMENTS);
  vi.mocked(setPRThreadResolved).mockReset();
});

describe("resolving a thread", () => {
  it("keeps it resolved when the Undo fails, as GitHub still has it", async () => {
    vi.mocked(setPRThreadResolved)
      .mockResolvedValueOnce(RESOLVED)
      .mockRejectedValueOnce(new Error("no permission"));
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(setPRThreadResolved).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(isOpen()).toBe(true);
    expect(await screen.findByText("Couldn't undo")).toBeInTheDocument();
    expect(isOpen()).toBe(false);
    expect(screen.getByRole("button", { name: /1 resolved/ })).toBeInTheDocument();
  });

  it("shows only the latest click, not an earlier answer landing late", async () => {
    const resolve = deferred<PRThreadStatus>();
    const undo = deferred<PRThreadStatus>();
    vi.mocked(setPRThreadResolved)
      .mockReturnValueOnce(resolve.promise)
      .mockReturnValueOnce(undo.promise);
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Resolve" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(isOpen()).toBe(true);
    // The Resolve's answer arrives first: it mustn't flip the thread back.
    await act(async () => resolve.resolve(RESOLVED));
    await waitFor(() => expect(setPRThreadResolved).toHaveBeenCalledTimes(2));
    expect(isOpen()).toBe(true);
    await act(async () => undo.resolve(OPEN));
    expect(isOpen()).toBe(true);
  });

  it("returns to GitHub's last answer when a queued write follows a failed one", async () => {
    const first = deferred<PRThreadStatus>();
    vi.mocked(setPRThreadResolved)
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new Error("down"));
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Resolve" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await act(async () => first.reject(new Error("down")));
    expect(await screen.findByText("Couldn't undo")).toBeInTheDocument();
    // Neither write took: the thread is as GitHub had it, open.
    expect(isOpen()).toBe(true);
  });

  it("moves focus to Undo after a keyboard Resolve", async () => {
    vi.mocked(setPRThreadResolved).mockResolvedValue(RESOLVED);
    render(<Harness />);
    const button = await screen.findByRole("button", { name: "Resolve" });
    // A keyboard press reports zero clicks.
    fireEvent.click(button, { detail: 0 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus());
  });

  it("keeps a keyboard user in the feedback after Undo", async () => {
    vi.mocked(setPRThreadResolved).mockResolvedValue(RESOLVED);
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Resolve" }), { detail: 0 });
    const undo = await screen.findByRole("button", { name: "Undo" });
    await waitFor(() => expect(undo).toHaveFocus());
    fireEvent.click(undo, { detail: 0 });
    expect(screen.getByText("Code feedback").parentElement).toHaveFocus();
  });
});
