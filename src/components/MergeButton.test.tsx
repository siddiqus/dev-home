import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubPR } from "../types";
import type { MergeOptions } from "../api/github";
import { fetchMergeOptions, mergePR } from "../services/github";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import { MergeProvider } from "../context/MergeContext";
import { MergeButton } from "./MergeButton";

vi.mock("../services/github", () => ({ fetchMergeOptions: vi.fn(), mergePR: vi.fn() }));

function readyPR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 12,
    title: "Ship it",
    html_url: "https://github.com/o/app/pull/12",
    state: "open",
    draft: false,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    user: { login: "Me", avatar_url: "" },
    head: { ref: "feature", sha: "abc123" },
    base: { ref: "main" },
    repo_full_name: "o/app",
    checks_status: "SUCCESS",
    checks: [],
    review_status: "APPROVED",
    in_merge_queue: false,
    has_conflict: false,
    ...overrides,
  };
}

const OPTIONS: MergeOptions = {
  pullRequestId: "PR_node",
  queue: false,
  methods: ["SQUASH", "MERGE"],
};

const onRow = vi.fn();
const onMerged = vi.fn();

function renderButton(pr: GitHubPR = readyPR(), { viewer = "me", provider = true } = {}) {
  const button = (
    // The row behind the button: clicks and keys on the button mustn't reach it.
    <div onClick={onRow} onKeyDown={onRow}>
      <MergeButton pr={pr} fallback={<span>Ready to merge chip</span>} />
    </div>
  );
  return render(
    <ViewerLoginContext.Provider value={viewer}>
      {provider ? <MergeProvider onMerged={onMerged}>{button}</MergeProvider> : button}
    </ViewerLoginContext.Provider>,
  );
}

/** Flush the lookup / merge promises. */
const settle = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(fetchMergeOptions).mockReset().mockResolvedValue(OPTIONS);
  vi.mocked(mergePR).mockReset().mockResolvedValue(undefined);
  onRow.mockReset();
  onMerged.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MergeButton", () => {
  it("replaces the chip on my own ready PR", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
    expect(screen.queryByText("Ready to merge chip")).not.toBeInTheDocument();
  });

  it("keeps the chip on PRs that aren't ready, aren't mine, or outside a MergeProvider", () => {
    renderButton(readyPR({ checks_status: "PENDING" }));
    expect(screen.getByText("Ready to merge chip")).toBeInTheDocument();
    renderButton(readyPR(), { viewer: "someone-else" });
    renderButton(readyPR(), { provider: false });
    renderButton(readyPR({ state: "closed", merged_at: "2026-10-03T00:00:00Z" }));
    expect(screen.getAllByText("Ready to merge chip")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();
  });

  it("asks to confirm with my default method on the first click, without opening the row", async () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await settle();
    expect(fetchMergeOptions).toHaveBeenCalledWith(expect.objectContaining({ number: 12 }));
    expect(screen.getByRole("button", { name: "Squash & merge?" })).toBeInTheDocument();
    expect(mergePR).not.toHaveBeenCalled();
    expect(onRow).not.toHaveBeenCalled();
  });

  it("merges on the second click, then says so and refreshes", async () => {
    const pr = readyPR();
    renderButton(pr);
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Squash & merge?" }));
    await settle();
    expect(mergePR).toHaveBeenCalledWith(pr, OPTIONS, "SQUASH");
    expect(screen.getByText("Merged")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /merge/i })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Merged app#12");
    expect(onMerged).toHaveBeenCalledTimes(1);
  });

  it("stays merged when the row remounts before the refresh drops it", async () => {
    const pr = readyPR();
    const tree = (key: string) => (
      <ViewerLoginContext.Provider value="me">
        <MergeProvider onMerged={onMerged}>
          <MergeButton key={key} pr={{ ...pr }} fallback={null} />
        </MergeProvider>
      </ViewerLoginContext.Provider>
    );
    const { rerender } = render(tree("first"));
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Squash & merge?" }));
    await settle();
    rerender(tree("remounted"));
    expect(screen.getByText("Merged")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();
  });

  it("goes back to Merge if the confirm isn't clicked within 4s", async () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await settle();
    expect(screen.getByRole("button", { name: "Squash & merge?" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
    expect(mergePR).not.toHaveBeenCalled();
  });

  it("lists the repo's methods under the caret, default first, and confirms the one picked", async () => {
    const pr = readyPR();
    renderButton(pr);
    fireEvent.click(screen.getByRole("button", { name: "Merge methods" }));
    await settle();
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["Squash and merge", "Create a merge commit"]);
    expect(items[0]).toHaveAttribute("aria-checked", "true");
    expect(onRow).not.toHaveBeenCalled();

    fireEvent.click(items[1]);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Merge commit?" }));
    await settle();
    expect(mergePR).toHaveBeenCalledWith(pr, OPTIONS, "MERGE");
  });

  it("opens the menu inside an enclosing modal, so the modal's stacking and focus trap don't hide it", async () => {
    render(
      <ViewerLoginContext.Provider value="me">
        <MergeProvider>
          <div className="modal" data-testid="modal">
            <MergeButton pr={readyPR()} fallback={<span>chip</span>} />
          </div>
        </MergeProvider>
      </ViewerLoginContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Merge methods" }));
    await settle();
    expect(within(screen.getByTestId("modal")).getByRole("menu")).toBeInTheDocument();
  });

  it("closes the menu on Escape", async () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Merge methods" }));
    await settle();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("drops the caret once the repo turns out to allow one method", async () => {
    vi.mocked(fetchMergeOptions).mockResolvedValue({ ...OPTIONS, methods: ["SQUASH"] });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await settle();
    expect(screen.queryByRole("button", { name: "Merge methods" })).not.toBeInTheDocument();
  });

  it("adds the PR to the merge queue when its base branch has one", async () => {
    vi.mocked(fetchMergeOptions).mockResolvedValue({ ...OPTIONS, queue: true });
    const pr = readyPR();
    renderButton(pr);
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await settle();
    expect(screen.queryByRole("button", { name: "Merge methods" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to merge queue?" }));
    await settle();
    expect(mergePR).toHaveBeenCalledWith(pr, { ...OPTIONS, queue: true }, "SQUASH");
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Added app#12 to the merge queue");
  });

  it("shows GitHub's reason when the merge is refused, and resets", async () => {
    vi.mocked(mergePR).mockRejectedValue(
      Object.assign(new Error("GitHub GraphQL error: Head branch was modified"), {
        graphqlErrors: [{ type: "UNPROCESSABLE", message: "Head branch was modified" }],
      }),
    );
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Squash & merge?" }));
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't merge app#12: Head branch was modified",
    );
    expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
    expect(onMerged).not.toHaveBeenCalled();
  });

  it("explains a token without write access", async () => {
    vi.mocked(mergePR).mockRejectedValue(
      Object.assign(new Error("GitHub GraphQL error"), {
        graphqlErrors: [
          { type: "FORBIDDEN", message: "Resource not accessible by personal access token" },
        ],
      }),
    );
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Squash & merge?" }));
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(/token can't merge/i);
  });

  it("resets when the lookup fails", async () => {
    vi.mocked(fetchMergeOptions).mockRejectedValue(new Error("Network down"));
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't merge app#12: Network down");
    expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
  });

  it("keeps keys on the button from reaching the row", () => {
    renderButton();
    fireEvent.keyDown(screen.getByRole("button", { name: "Merge" }), { key: "Enter" });
    expect(onRow).not.toHaveBeenCalled();
  });
});
