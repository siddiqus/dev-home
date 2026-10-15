import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ReviewsView } from "./ReviewsView";
import type { GitHubPR } from "../../types";

function makePR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: Math.floor(Math.random() * 1e9),
    number: 1,
    title: "Test PR",
    html_url: "https://github.com/o/r/pull/1",
    state: "open",
    draft: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    user: { login: "octocat", avatar_url: "" },
    head: { ref: "feature" },
    base: { ref: "main" },
    body: "",
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    in_merge_queue: false,
    ...overrides,
  };
}

const sectionOf = (label: string): HTMLElement =>
  screen.getByText(label).closest(".pr-section") as HTMLElement;

describe("ReviewsView", () => {
  beforeEach(() => localStorage.clear());

  it("puts reviewing PRs on top and untouched requests below, dropping engaged requests", () => {
    render(
      <ReviewsView
        loading={false}
        reviewingPRs={[makePR({ number: 1, title: "In progress" })]}
        reviewRequests={[
          makePR({ number: 2, title: "Untouched" }),
          makePR({ number: 3, title: "Re-requested", viewer_engaged: true }),
        ]}
      />,
    );

    const sections = document.querySelectorAll(".pr-section");
    expect(sections).toHaveLength(2);
    expect(within(sections[0] as HTMLElement).getByText("Currently reviewing")).toBeTruthy();
    expect(within(sections[1] as HTMLElement).getByText("Review requested")).toBeTruthy();

    expect(within(sectionOf("Currently reviewing")).getByText("In progress")).toBeTruthy();
    const requested = sectionOf("Review requested");
    expect(within(requested).getByText("Untouched")).toBeTruthy();
    expect(within(requested).queryByText("Re-requested")).toBeNull();
  });

  it("labels each row with what the reviewer should do", () => {
    const reRequested = makePR({
      number: 3,
      title: "Back to you",
      html_url: "https://github.com/o/r/pull/3",
      viewer_engaged: true,
    });
    render(
      <ReviewsView
        loading={false}
        reviewingPRs={[
          makePR({
            number: 1,
            title: "Pushed again",
            html_url: "https://github.com/o/r/pull/1",
            new_commits_since_review: true,
            viewer_review_state: "COMMENTED",
          }),
          makePR({ number: 4, title: "Idle", html_url: "https://github.com/o/r/pull/4" }),
          reRequested,
        ]}
        reviewRequests={[
          makePR({ number: 2, title: "Fresh", html_url: "https://github.com/o/r/pull/2" }),
          reRequested,
        ]}
      />,
    );

    const pillIn = (title: string) =>
      screen.getByText(title).closest(".pr-card")!.querySelector(".pr-reason-chip")?.textContent;
    expect(pillIn("Pushed again")).toBe("New commits");
    expect(pillIn("Idle")).toBe("Waiting on author");
    expect(pillIn("Back to you")).toBe("Re-requested");
    // Redundant with its "Review requested" section, so no pill.
    expect(pillIn("Fresh")).toBeUndefined();
  });

  it("shows the Approved pill on approved PRs in Currently reviewing only", () => {
    render(
      <ReviewsView
        loading={false}
        reviewingPRs={[
          makePR({ number: 1, title: "Approved one", review_status: "APPROVED" }),
          makePR({ number: 2, title: "Not yet", review_status: "REVIEWED" }),
        ]}
        reviewRequests={[
          makePR({ number: 3, title: "Requested approved", review_status: "APPROVED" }),
        ]}
      />,
    );

    const statusIn = (title: string) =>
      screen.getByText(title).closest(".pr-card")!.querySelector(".pr-card-status")?.textContent;
    expect(statusIn("Approved one")).toBe("Approved");
    expect(statusIn("Not yet")).toBeUndefined();
    expect(statusIn("Requested approved")).toBeUndefined();
  });

  it("hides an empty section", () => {
    render(
      <ReviewsView
        loading={false}
        reviewingPRs={[]}
        reviewRequests={[makePR({ title: "Untouched" })]}
      />,
    );
    expect(screen.queryByText("Currently reviewing")).toBeNull();
    expect(screen.getByText("Review requested")).toBeTruthy();
  });
});
