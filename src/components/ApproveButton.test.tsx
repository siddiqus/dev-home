import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubPR } from "../types";
import { ApiError } from "../api/http/errors";
import { approvePR } from "../services/github";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import { MergeProvider } from "../context/MergeContext";
import { ApproveButton } from "./ApproveButton";

vi.mock("../services/github", () => ({
  approvePR: vi.fn(),
  fetchMergeOptions: vi.fn(),
  mergePR: vi.fn(),
}));

/** Someone else's open PR, waiting on my review. */
function reviewPR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 12,
    title: "Fix paging",
    html_url: "https://github.com/o/app/pull/12",
    state: "open",
    draft: false,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    user: { login: "rkhan", avatar_url: "" },
    head: { ref: "fix/paging", sha: "abc123" },
    base: { ref: "main" },
    repo_full_name: "o/app",
    checks_status: "SUCCESS",
    checks: [],
    review_status: null,
    viewer_review_state: null,
    ...overrides,
  };
}

const onApproved = vi.fn();

function renderButton(pr: GitHubPR = reviewPR(), { viewer = "me", provider = true } = {}) {
  const button = <ApproveButton pr={pr} />;
  return render(
    <ViewerLoginContext.Provider value={viewer}>
      {provider ? <MergeProvider onApproved={onApproved}>{button}</MergeProvider> : button}
    </ViewerLoginContext.Provider>,
  );
}

const approveButton = () => screen.getByRole("button", { name: "Approve" });

/** Flush the approve promise. */
const settle = () => act(async () => {});

let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(approvePR).mockReset().mockResolvedValue(undefined);
  onApproved.mockReset();
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  confirmSpy.mockRestore();
});

describe("ApproveButton", () => {
  it("shows on someone else's open PR I haven't approved", () => {
    renderButton();
    expect(approveButton()).toBeInTheDocument();
  });

  it("still shows after I commented or asked for changes", () => {
    renderButton(reviewPR({ viewer_review_state: "CHANGES_REQUESTED" }));
    renderButton(reviewPR({ viewer_review_state: "COMMENTED" }));
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(2);
  });

  it("hides on my own, draft, closed or already-approved PRs, and outside a MergeProvider", () => {
    renderButton(reviewPR({ user: { login: "Me", avatar_url: "" } }));
    renderButton(reviewPR({ draft: true }));
    renderButton(reviewPR({ state: "closed" }));
    renderButton(reviewPR({ state: "closed", merged_at: "2026-10-03T00:00:00Z" }));
    renderButton(reviewPR({ viewer_review_state: "APPROVED" }));
    renderButton(reviewPR(), { provider: false });
    renderButton(reviewPR(), { viewer: "" });
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("asks 'are you sure' about this PR before approving", async () => {
    renderButton();
    fireEvent.click(approveButton());
    await settle();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/^Are you sure you want to approve this PR\?/);
    expect(confirmSpy.mock.calls[0][0]).toContain("app#12 Fix paging");
  });

  it("does nothing when the confirm is cancelled", async () => {
    confirmSpy.mockReturnValue(false);
    renderButton();
    fireEvent.click(approveButton());
    await settle();
    expect(approvePR).not.toHaveBeenCalled();
    expect(approveButton()).toBeInTheDocument();
  });

  it("approves once confirmed, then says so and refreshes", async () => {
    const pr = reviewPR();
    renderButton(pr);
    fireEvent.click(approveButton());
    await settle();
    expect(approvePR).toHaveBeenCalledWith(pr);
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Approved app#12");
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it("approves once, without asking again, however often the busy button is clicked", async () => {
    let finish!: () => void;
    vi.mocked(approvePR).mockReturnValue(new Promise<void>((r) => (finish = r)));
    renderButton();
    fireEvent.click(approveButton());
    fireEvent.click(screen.getByRole("button", { name: "Approving…" }));
    fireEvent.click(screen.getByRole("button", { name: "Approving…" }));
    await act(async () => finish());
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(approvePR).toHaveBeenCalledTimes(1);
  });

  it("stays approved when it remounts before the refresh catches up", async () => {
    const pr = reviewPR();
    const tree = (key: string) => (
      <ViewerLoginContext.Provider value="me">
        <MergeProvider onApproved={onApproved}>
          <ApproveButton key={key} pr={{ ...pr }} />
        </MergeProvider>
      </ViewerLoginContext.Provider>
    );
    const { rerender } = render(tree("first"));
    fireEvent.click(approveButton());
    await settle();
    rerender(tree("remounted"));
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("shows GitHub's reason when it refuses, and resets", async () => {
    vi.mocked(approvePR).mockRejectedValue(
      new ApiError(422, "Can not approve your own pull request"),
    );
    renderButton();
    fireEvent.click(approveButton());
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't approve app#12: Can not approve your own pull request",
    );
    expect(approveButton()).toBeInTheDocument();
    expect(onApproved).not.toHaveBeenCalled();
  });

  it("explains a token without permission to review", async () => {
    vi.mocked(approvePR).mockRejectedValue(
      new ApiError(403, "Resource not accessible by personal access token"),
    );
    renderButton();
    fireEvent.click(approveButton());
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't approve app#12: your GitHub token can't review here. It needs Pull requests: write (see Settings)",
    );
  });
});
