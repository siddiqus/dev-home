import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubPR } from "../types";
import { ApiError } from "../api/http/errors";
import { fetchOrgMembers, fetchOrgTeams, requestPRReviewers } from "../services/github";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import { MergeProvider, nameList } from "../context/MergeContext";
import { RequestReviewButton } from "./RequestReviewButton";

vi.mock("../services/github", () => ({
  approvePR: vi.fn(),
  fetchMergeOptions: vi.fn(),
  mergePR: vi.fn(),
  requestPRReviewers: vi.fn(),
  fetchOrgMembers: vi.fn(),
  fetchOrgTeams: vi.fn(),
}));

/** My open PR, green, nobody asked to review yet. */
function myPR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 12,
    title: "Fix paging",
    html_url: "https://github.com/o/app/pull/12",
    state: "open",
    draft: false,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: "fix/paging", sha: "abc123" },
    base: { ref: "main" },
    repo_full_name: "o/app",
    checks_status: "SUCCESS",
    checks: [],
    review_status: null,
    requested_reviewers: [],
    ...overrides,
  };
}

const onReviewRequested = vi.fn();
const rowClick = vi.fn();

function renderButton(pr: GitHubPR = myPR(), { viewer = "me", provider = true } = {}) {
  // Inside a clickable row, like the deck and list rows.
  const row = (
    <div onClick={rowClick}>
      <RequestReviewButton pr={pr} fallback={<span>chip</span>} />
    </div>
  );
  return render(
    <ViewerLoginContext.Provider value={viewer}>
      {provider ? <MergeProvider onReviewRequested={onReviewRequested}>{row}</MergeProvider> : row}
    </ViewerLoginContext.Provider>,
  );
}

const settle = () => act(async () => {});
const dialog = () => screen.getByRole("dialog");

async function openPicker(name: RegExp | string = "Request a review") {
  fireEvent.click(screen.getByRole("button", { name }));
  await settle();
  return dialog();
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(requestPRReviewers).mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchOrgMembers)
    .mockReset()
    .mockResolvedValue([
      { login: "abu", name: "Abu Bakar", avatar_url: "https://avatars/abu" },
      { login: "me", name: null, avatar_url: "" },
      { login: "rkhan", name: null, avatar_url: "https://avatars/rkhan" },
    ]);
  vi.mocked(fetchOrgTeams)
    .mockReset()
    .mockResolvedValue([
      { slug: "frontend", name: "Frontend", members: ["abu", "rkhan"] },
      { slug: "platform-core", name: "Platform", members: ["abu", "rkhan", "me"] },
    ]);
  onReviewRequested.mockReset();
  rowClick.mockReset();
});

describe("RequestReviewButton", () => {
  it("takes the chip's place on my PR when nobody has been asked", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "Request a review" })).toBeInTheDocument();
    expect(screen.queryByText("chip")).not.toBeInTheDocument();
  });

  it("says Re-request review once a review came back and nobody is asked now", () => {
    renderButton(myPR({ review_status: "REVIEWED" }));
    expect(screen.getByRole("button", { name: "Re-request review" })).toBeInTheDocument();
  });

  it("keeps the chip on someone else's PR, while someone is asked, and outside a MergeProvider", () => {
    renderButton(myPR({ user: { login: "abu", avatar_url: "" } }));
    renderButton(myPR({ requested_reviewers: ["abu"] }));
    renderButton(myPR({ checks_status: "FAILURE" }));
    renderButton(myPR({ state: "closed" }));
    renderButton(myPR(), { provider: false });
    renderButton(myPR(), { viewer: "" });
    expect(screen.queryByRole("button", { name: /request/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("chip")).toHaveLength(6);
  });

  it("opens a picker of org people and teams, without the PR's author, and the row doesn't open", async () => {
    renderButton();
    const picker = await openPicker();
    expect(rowClick).not.toHaveBeenCalled();
    expect(within(picker).getByText("Request a review")).toBeInTheDocument();
    expect(within(picker).getByText("app#12 · Fix paging")).toBeInTheDocument();
    expect(within(picker).getByLabelText("abu")).toBeInTheDocument();
    expect(within(picker).getByLabelText("rkhan")).toBeInTheDocument();
    expect(within(picker).queryByLabelText("me")).not.toBeInTheDocument();
    expect(within(picker).getByLabelText("Frontend")).toBeInTheDocument();
    // A team's slug shows beside its name when they differ.
    expect(within(picker).getByText("platform-core")).toBeInTheDocument();
    expect(within(picker).getByRole("button", { name: "Request review" })).toBeDisabled();
  });

  it("narrows people and teams by the search", async () => {
    renderButton();
    const picker = await openPicker();
    fireEvent.change(within(picker).getByLabelText("Search people and teams"), {
      target: { value: "plat" },
    });
    expect(within(picker).getByLabelText("Platform")).toBeInTheDocument();
    expect(within(picker).queryByLabelText("abu")).not.toBeInTheDocument();
    expect(within(picker).queryByLabelText("Frontend")).not.toBeInTheDocument();
  });

  it("shows each team's member count", async () => {
    renderButton();
    const picker = await openPicker();
    const teams = within(picker).getByRole("region", { name: "Teams" });
    expect(within(teams).getByText("2")).toBeInTheDocument();
    expect(within(teams).getByText("3")).toBeInTheDocument();
  });

  it("says why when GitHub lists no teams", async () => {
    vi.mocked(fetchOrgTeams).mockResolvedValue([]);
    renderButton();
    const picker = await openPicker();
    expect(
      within(picker).getByText(
        "No teams to show. Listing teams needs org read access on your GitHub token.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a person's GitHub name beside their login and finds them by it", async () => {
    renderButton();
    const picker = await openPicker();
    expect(within(picker).getByText("Abu Bakar")).toBeInTheDocument();
    fireEvent.change(within(picker).getByLabelText("Search people and teams"), {
      target: { value: "bakar" },
    });
    expect(within(picker).getByLabelText("abu")).toBeInTheDocument();
    expect(within(picker).queryByLabelText("rkhan")).not.toBeInTheDocument();
  });

  it("requests the picked people and teams, then says so and refreshes", async () => {
    const pr = myPR();
    renderButton(pr);
    const picker = await openPicker();
    fireEvent.click(within(picker).getByLabelText("abu"));
    fireEvent.click(within(picker).getByLabelText("Frontend"));
    expect(within(picker).getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole("button", { name: "Request review" }));
    await settle();

    expect(requestPRReviewers).toHaveBeenCalledWith(pr, { users: ["abu"], teams: ["frontend"] });
    expect(rowClick).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Requested a review from abu and Frontend on app#12",
    );
    expect(onReviewRequested).toHaveBeenCalledTimes(1);
    // Until the refresh lands, the button says it's done instead of asking again.
    expect(screen.getByText("Review requested")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request a review" })).not.toBeInTheDocument();
  });

  it("asks again once fresh data shows the PR needs another request", async () => {
    const pr = myPR();
    const tree = (p: GitHubPR) => (
      <ViewerLoginContext.Provider value="me">
        <MergeProvider>
          <RequestReviewButton pr={p} fallback={<span>chip</span>} />
        </MergeProvider>
      </ViewerLoginContext.Provider>
    );
    const { rerender } = render(tree(pr));
    const picker = await openPicker();
    fireEvent.click(within(picker).getByLabelText("abu"));
    fireEvent.click(within(picker).getByRole("button", { name: "Request review" }));
    await settle();
    expect(screen.getByText("Review requested")).toBeInTheDocument();

    // abu reviewed since, and nobody is asked now.
    rerender(tree(myPR({ review_status: "REVIEWED", updated_at: "2026-10-05T00:00:00Z" })));
    expect(screen.getByRole("button", { name: "Re-request review" })).toBeInTheDocument();
  });

  it("on a re-request, lists who reviewed before first, already ticked", async () => {
    const pr = myPR({
      review_status: "REVIEWED",
      participants: [{ login: "rkhan", state: "COMMENTED" }],
    });
    renderButton(pr);
    const picker = await openPicker("Re-request review");
    const before = within(picker).getByRole("region", { name: "Reviewed before" });
    expect(within(before).getByLabelText("rkhan")).toBeChecked();
    // Listed once, not again under People.
    expect(within(picker).getAllByLabelText("rkhan")).toHaveLength(1);
    fireEvent.click(within(picker).getByRole("button", { name: "Re-request review" }));
    await settle();
    expect(requestPRReviewers).toHaveBeenCalledWith(pr, { users: ["rkhan"], teams: [] });
  });

  it("keeps the picker open and says GitHub's reason when it refuses", async () => {
    vi.mocked(requestPRReviewers).mockRejectedValue(
      new ApiError(422, "Reviews may only be requested from collaborators."),
    );
    renderButton();
    const picker = await openPicker();
    fireEvent.click(within(picker).getByLabelText("abu"));
    fireEvent.click(within(picker).getByRole("button", { name: "Request review" }));
    await settle();
    expect(within(dialog()).getByRole("alert")).toHaveTextContent(
      "Couldn't request a review: Reviews may only be requested from collaborators.",
    );
    expect(within(dialog()).getByRole("button", { name: "Request review" })).toBeEnabled();
    expect(onReviewRequested).not.toHaveBeenCalled();
  });

  it("points a token without write access at Settings", async () => {
    vi.mocked(requestPRReviewers).mockRejectedValue(
      new ApiError(403, "Resource not accessible by personal access token"),
    );
    renderButton();
    const picker = await openPicker();
    fireEvent.click(within(picker).getByLabelText("abu"));
    fireEvent.click(within(picker).getByRole("button", { name: "Request review" }));
    await settle();
    expect(within(dialog()).getByRole("alert")).toHaveTextContent(
      "your GitHub token can't request reviews here. It needs Pull requests: write (see Settings)",
    );
  });

  it("still lists people when teams can't be loaded, and says why", async () => {
    vi.mocked(fetchOrgTeams).mockRejectedValue(
      new ApiError(403, "Resource not accessible by personal access token"),
    );
    renderButton();
    const picker = await openPicker();
    expect(within(picker).getByLabelText("abu")).toBeInTheDocument();
    expect(within(picker).getByText(/Couldn't load teams/)).toBeInTheDocument();
  });

  it("opens from the saved list without refetching, until Refresh", async () => {
    renderButton();
    await openPicker();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    await settle();
    expect(fetchOrgMembers).toHaveBeenCalledTimes(1);

    const picker = await openPicker();
    expect(within(picker).getByLabelText("abu")).toBeInTheDocument();
    expect(fetchOrgMembers).toHaveBeenCalledTimes(1);
    expect(fetchOrgTeams).toHaveBeenCalledTimes(1);

    fireEvent.click(within(picker).getByRole("button", { name: "Refresh people and teams" }));
    await settle();
    expect(fetchOrgMembers).toHaveBeenLastCalledWith({ force: true });
    expect(fetchOrgTeams).toHaveBeenLastCalledWith({ force: true });
  });
});

describe("nameList", () => {
  it("names up to three, then counts the rest", () => {
    expect(nameList(["abu"])).toBe("abu");
    expect(nameList(["abu", "Frontend"])).toBe("abu and Frontend");
    expect(nameList(["abu", "rkhan", "Frontend"])).toBe("abu, rkhan and Frontend");
    expect(nameList(["a", "b", "c", "d"])).toBe("a, b and 2 others");
  });
});
