import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PRCard, type PRCardFields } from "./PRCard";
import type { GitHubPR } from "../types";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import { MergeProvider } from "../context/MergeContext";

function makePR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 42,
    title: "Test PR",
    html_url: "https://github.com/o/r/pull/42",
    state: "open",
    draft: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
    user: { login: "octocat", avatar_url: "" },
    head: { ref: "feature" },
    base: { ref: "main" },
    body: "",
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    in_merge_queue: false,
    merged_at: undefined,
    ...overrides,
  };
}

const FIELDS: Record<string, PRCardFields> = {
  full: {
    showAuthor: true,
    showBranch: true,
    showStatus: true,
    showChecks: true,
    timestamps: "open",
  },
  reviews: {
    showAuthor: true,
    showBranch: false,
    showStatus: false,
    showChecks: true,
    timestamps: "open",
  },
  merged: {
    showAuthor: false,
    showBranch: true,
    showStatus: false,
    showChecks: false,
    timestamps: "merged",
  },
};

const noop = () => {};

describe("PRCard", () => {
  it("renders title, repo#number, and a GitHub external link", () => {
    render(<PRCard pr={makePR()} fields={FIELDS.full} onOpen={noop} />);
    expect(screen.getByText("Test PR")).toBeInTheDocument();
    expect(screen.getByText("o/r#42")).toBeInTheDocument();
    const gh = screen.getByTitle("Open PR on GitHub");
    expect(gh).toHaveAttribute("href", "https://github.com/o/r/pull/42");
    expect(gh).toHaveAttribute("target", "_blank");
  });

  it("opens the PR when the card is clicked", () => {
    const onOpen = vi.fn();
    render(<PRCard pr={makePR()} fields={FIELDS.full} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not open the PR when the GitHub link is clicked (stopPropagation)", () => {
    const onOpen = vi.fn();
    render(<PRCard pr={makePR()} fields={FIELDS.full} onOpen={onOpen} />);
    fireEvent.click(screen.getByTitle("Open PR on GitHub"));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("copies the PR link without opening the PR (stopPropagation)", () => {
    const onOpen = vi.fn();
    const onCopyLink = vi.fn();
    render(<PRCard pr={makePR()} fields={FIELDS.full} onOpen={onOpen} onCopyLink={onCopyLink} />);
    fireEvent.click(screen.getByTitle("Copy PR link"));
    expect(onCopyLink).toHaveBeenCalledWith("https://github.com/o/r/pull/42");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("copies the owner/repo#number reference without opening the PR", () => {
    const onOpen = vi.fn();
    const onCopyRef = vi.fn();
    const pr = makePR();
    render(<PRCard pr={pr} fields={FIELDS.full} onOpen={onOpen} onCopyRef={onCopyRef} />);
    fireEvent.click(screen.getByTitle("Copy PR reference"));
    expect(onCopyRef).toHaveBeenCalledWith(`${pr.repo_full_name}#${pr.number}`);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not open the PR when activating the copy button via keyboard", () => {
    const onOpen = vi.fn();
    const onCopyLink = vi.fn();
    render(<PRCard pr={makePR()} fields={FIELDS.full} onOpen={onOpen} onCopyLink={onCopyLink} />);
    fireEvent.keyDown(screen.getByTitle("Copy PR link"), { key: "Enter" });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("shows the branch (head only for the default base) when showBranch is set", () => {
    render(
      <PRCard pr={makePR({ head: { ref: "my-branch" } })} fields={FIELDS.full} onOpen={noop} />,
    );
    expect(screen.getByText("my-branch")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it("shows head → base when the base is not the default branch", () => {
    render(
      <PRCard
        pr={makePR({ head: { ref: "my-branch" }, base: { ref: "release/3.2" } })}
        fields={FIELDS.full}
        onOpen={noop}
      />,
    );
    expect(screen.getByText(/→ release\/3\.2/)).toBeInTheDocument();
  });

  it("hides the branch when showBranch is false (reviews variant)", () => {
    render(
      <PRCard
        pr={makePR({ head: { ref: "hidden-branch" } })}
        fields={FIELDS.reviews}
        onOpen={noop}
      />,
    );
    expect(screen.queryByText("hidden-branch")).not.toBeInTheDocument();
  });

  it("shows the author only when showAuthor is set", () => {
    const { rerender } = render(
      <PRCard
        pr={makePR({ user: { login: "alice", avatar_url: "" } })}
        fields={FIELDS.full}
        onOpen={noop}
      />,
    );
    expect(screen.getByText("alice")).toBeInTheDocument();

    rerender(
      <PRCard
        pr={makePR({ user: { login: "alice", avatar_url: "" } })}
        fields={{ ...FIELDS.full, showAuthor: false }}
        onOpen={noop}
      />,
    );
    expect(screen.queryByText("alice")).not.toBeInTheDocument();
  });

  it("derives the status pill from PR state", () => {
    const cases: [Partial<GitHubPR>, string][] = [
      [{ review_status: "APPROVED" }, "Approved"],
      [{ review_status: "CHANGES_REQUESTED" }, "Changes requested"],
      [{ review_status: "REVIEWED" }, "Reviewed"],
      [{ review_status: null }, "Awaiting review"],
      [{ draft: true }, "Draft"],
      [{ in_merge_queue: true }, "In Merge Queue"],
    ];
    for (const [overrides, label] of cases) {
      const { unmount } = render(
        <PRCard pr={makePR(overrides)} fields={FIELDS.full} onOpen={noop} />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("hides the status pill when showStatus is false", () => {
    render(
      <PRCard pr={makePR({ review_status: "APPROVED" })} fields={FIELDS.reviews} onOpen={noop} />,
    );
    expect(screen.queryByText("Approved")).not.toBeInTheDocument();
  });

  it("renders opened/updated timestamps for open variants and merged for merged variants", () => {
    const { unmount } = render(<PRCard pr={makePR()} fields={FIELDS.full} onOpen={noop} />);
    expect(screen.getByText(/opened .* · updated /)).toBeInTheDocument();
    unmount();

    render(
      <PRCard
        pr={makePR({ merged_at: "2026-07-05T00:00:00Z" })}
        fields={FIELDS.merged}
        onOpen={noop}
      />,
    );
    expect(screen.getByText(/^merged /)).toBeInTheDocument();
  });

  it("shows approved by and merged by on merged rows only", () => {
    const pr = makePR({
      merged_at: "2026-07-05T00:00:00Z",
      merged_by: "carol",
      approved_by: ["alice", "bob"],
    });
    const { unmount } = render(<PRCard pr={pr} fields={FIELDS.merged} onOpen={noop} />);
    expect(screen.getByText("approved by alice, bob")).toBeInTheDocument();
    expect(screen.getByText("merged by carol")).toBeInTheDocument();
    unmount();

    render(<PRCard pr={pr} fields={FIELDS.full} onOpen={noop} />);
    expect(screen.queryByText(/approved by/)).not.toBeInTheDocument();
  });

  it("omits approved by when nobody approved", () => {
    render(
      <PRCard
        pr={makePR({ merged_at: "2026-07-05T00:00:00Z", merged_by: "carol", approved_by: [] })}
        fields={FIELDS.merged}
        onOpen={noop}
      />,
    );
    expect(screen.queryByText(/approved by/)).not.toBeInTheDocument();
    expect(screen.getByText("merged by carol")).toBeInTheDocument();
  });

  it("linkifies the Jira ticket in place when the title already contains it", () => {
    render(
      <PRCard
        pr={makePR({ title: "PROJ-7: Update the widget" })}
        fields={FIELDS.full}
        singleTicket="PROJ-7"
        jiraBaseUrl="https://jira.example.com"
        onOpen={noop}
      />,
    );
    const link = screen.getByRole("link", { name: "PROJ-7" });
    expect(link).toHaveAttribute("href", "https://jira.example.com/browse/PROJ-7");
    // The ticket must appear exactly once — no "PROJ-7: PROJ-7: …" duplication.
    expect(screen.getAllByText(/PROJ-7/)).toHaveLength(1);
  });

  it("prepends the ticket link when the title does not contain it", () => {
    render(
      <PRCard
        pr={makePR({ title: "Update the widget" })}
        fields={FIELDS.full}
        singleTicket="PROJ-7"
        jiraBaseUrl="https://jira.example.com"
        onOpen={noop}
      />,
    );
    const link = screen.getByRole("link", { name: "PROJ-7" });
    expect(link).toHaveAttribute("href", "https://jira.example.com/browse/PROJ-7");
  });

  it("renders label badges tinted with their GitHub color", () => {
    render(
      <PRCard
        pr={makePR({ labels: [{ name: "bug", color: "d73a4a" }] })}
        fields={FIELDS.full}
        onOpen={noop}
      />,
    );
    const badge = screen.getByText("bug");
    expect(badge).toHaveClass("pr-card-label");
    expect(badge).toHaveStyle({ backgroundColor: "#d73a4a" });
  });

  it("picks readable text: dark on light labels, light on dark labels", () => {
    const { unmount } = render(
      <PRCard
        pr={makePR({ labels: [{ name: "light", color: "ffffff" }] })}
        fields={FIELDS.full}
        onOpen={noop}
      />,
    );
    expect(screen.getByText("light")).toHaveStyle({ color: "#1b1f24" });
    unmount();

    render(
      <PRCard
        pr={makePR({ labels: [{ name: "dark", color: "000000" }] })}
        fields={FIELDS.full}
        onOpen={noop}
      />,
    );
    expect(screen.getByText("dark")).toHaveStyle({ color: "#ffffff" });
  });

  it("renders no label badges when the PR has no labels", () => {
    const { container } = render(
      <PRCard pr={makePR({ labels: [] })} fields={FIELDS.full} onOpen={noop} />,
    );
    expect(container.querySelector(".pr-card-label")).toBeNull();
  });

  it("shows note count badge when noteCount > 0", () => {
    render(<PRCard pr={makePR()} fields={FIELDS.full} noteCount={2} onOpen={noop} />);
    expect(screen.getByTitle("2 notes on this PR")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows singular note text for noteCount = 1", () => {
    render(<PRCard pr={makePR()} fields={FIELDS.full} noteCount={1} onOpen={noop} />);
    expect(screen.getByTitle("1 note on this PR")).toBeInTheDocument();
  });

  it("hides note badge when noteCount is 0", () => {
    const { container } = render(
      <PRCard pr={makePR()} fields={FIELDS.full} noteCount={0} onOpen={noop} />,
    );
    expect(container.querySelector(".pr-card-notes")).toBeNull();
  });

  it("hides note badge when noteCount is undefined", () => {
    const { container } = render(<PRCard pr={makePR()} fields={FIELDS.full} onOpen={noop} />);
    expect(container.querySelector(".pr-card-notes")).toBeNull();
  });
});

describe("PRCard signals", () => {
  const chipTexts = (container: HTMLElement, selector: string) =>
    [...container.querySelectorAll(`${selector} .pr-reason-chip`)].map((c) => c.textContent);

  it("puts the next step top-right and the other signals under the meta line", () => {
    const { container } = render(
      <PRCard
        pr={makePR({
          checks_status: "FAILURE",
          checks: [{ name: "lint", status: "FAILURE", url: null }],
          has_conflict: true,
          review_status: "CHANGES_REQUESTED",
          unresolved_thread_count: 2,
        })}
        fields={FIELDS.full}
        showSignals
        onOpen={noop}
      />,
    );
    expect(chipTexts(container, ".pr-card-side-top")).toEqual(["✗ Fix CI: lint"]);
    expect(chipTexts(container, ".pr-card-signals")).toEqual([
      "✗ Conflict with main",
      "✗ Changes requested",
      "2 open threads",
    ]);
    expect(container.querySelector(".pr-card-status")).toBeNull();
  });

  it("links review-feedback chips to the PR on GitHub without opening the row", () => {
    const onOpen = vi.fn();
    render(
      <PRCard
        pr={makePR({ review_status: "CHANGES_REQUESTED", unresolved_thread_count: 1 })}
        fields={FIELDS.full}
        showSignals
        onOpen={onOpen}
      />,
    );
    const link = screen.getByText("✗ Address requested changes · 1 open thread").closest("a")!;
    expect(link).toHaveAttribute("href", "https://github.com/o/r/pull/42");
    expect(link).toHaveAttribute("target", "_blank");
    fireEvent.click(link);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("leaves out the line underneath when the next step is the only signal", () => {
    const { container } = render(
      <PRCard
        pr={makePR({ review_status: "APPROVED", checks_status: "SUCCESS" })}
        fields={FIELDS.full}
        showSignals
        onOpen={noop}
      />,
    );
    expect(screen.getByText("✓ Ready to merge")).toHaveClass("pr-reason-chip--success");
    expect(container.querySelector(".pr-card-signals")).toBeNull();
  });

  it("falls back to the status pill (no signals) when showSignals is unset", () => {
    const { container } = render(
      <PRCard
        pr={makePR({ checks_status: "FAILURE", review_status: "CHANGES_REQUESTED" })}
        fields={FIELDS.full}
        onOpen={noop}
      />,
    );
    expect(container.querySelector(".pr-card-signals")).toBeNull();
    expect(screen.getByText("Changes requested")).toHaveClass("pr-card-status");
  });
});

describe("PRCard next-action tag", () => {
  it("shows what I should do on my own PR, replacing the plain status pill", () => {
    render(
      <ViewerLoginContext.Provider value="octocat">
        <PRCard
          pr={makePR({ review_status: "REVIEWED", your_turn: true, requested_reviewers: [] })}
          fields={FIELDS.full}
          onOpen={noop}
        />
      </ViewerLoginContext.Provider>,
    );
    expect(screen.getByText("Respond to feedback")).toHaveClass("pr-reason-chip--warning");
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });

  it("keeps the plain status pill on PRs I'm not involved in", () => {
    render(
      <ViewerLoginContext.Provider value="someone-else">
        <PRCard pr={makePR({ review_status: "REVIEWED" })} fields={FIELDS.full} onOpen={noop} />
      </ViewerLoginContext.Provider>,
    );
    expect(screen.getByText("Reviewed")).toBeInTheDocument();
  });

  it("lists reviewers / commenters with their state, capped with +N", () => {
    const participants = [
      { login: "ann", state: "APPROVED" as const },
      { login: "bo", state: "CHANGES_REQUESTED" as const },
      { login: "cy", state: "COMMENTED" as const },
      { login: "di", state: "COMMENTED" as const },
    ];
    render(<PRCard pr={makePR({ participants })} fields={FIELDS.full} onOpen={noop} />);
    expect(screen.getByText("✓ann,")).toHaveClass("pr-participant--approved");
    expect(screen.getByText("✗bo,")).toHaveClass("pr-participant--changes_requested");
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.queryByText(/di/)).toBeNull();
    expect(screen.getByTitle(/di commented/)).toBeInTheDocument();
  });
});

describe("PRCard merge button", () => {
  const renderMine = (pr: GitHubPR, onOpen = noop) =>
    render(
      <ViewerLoginContext.Provider value="octocat">
        <MergeProvider>
          <PRCard pr={pr} fields={FIELDS.full} showSignals onOpen={onOpen} />
        </MergeProvider>
      </ViewerLoginContext.Provider>,
    );

  it("turns my ready PR's Ready to merge chip into the Merge button", () => {
    const onOpen = vi.fn();
    renderMine(makePR({ review_status: "APPROVED", checks_status: "SUCCESS" }), onOpen);
    expect(screen.queryByText("✓ Ready to merge")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("keeps the next-step chip on a PR that isn't ready", () => {
    renderMine(makePR({ review_status: "APPROVED", checks_status: "PENDING" }));
    expect(screen.getByText("✓ Approved · merge when CI passes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();
  });
});
