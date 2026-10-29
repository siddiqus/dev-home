import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReviewQueueModal } from "./ReviewQueueModal";
import type { ReviewQueueEntry } from "../../../types/teams";

function entry(overrides: Partial<ReviewQueueEntry>): ReviewQueueEntry {
  return {
    number: 1,
    repo_full_name: "newscred/cmp-server",
    title: "PR",
    html_url: "https://github.com/newscred/cmp-server/pull/1",
    author: "tashfia",
    state: "waitingReview",
    reason: "awaiting first review",
    reviewers: [],
    checks_status: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    waitingSince: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const entries = [
  entry({ number: 101, title: "Drop legacy serializer", reviewers: ["nadman"] }),
  entry({
    number: 202,
    repo_full_name: "newscred/cmp-frontend",
    title: "Calendar lazy-load",
    author: "outsider",
    reviewers: ["tashfia", "nadman"],
  }),
  entry({ number: 303, state: "draft", title: "WIP brand kit", author: "nadman" }),
  entry({ number: 404, state: "needsReviewer", title: "Bump boto3", author: "nadman" }),
];

const teamLogins = new Set(["tashfia", "nadman"]);

function renderModal(onOpenPR = vi.fn(), onHide = vi.fn()) {
  render(
    <ReviewQueueModal
      show
      onHide={onHide}
      entries={entries}
      teamLogins={teamLogins}
      onOpenPR={onOpenPR}
    />,
  );
  return { onOpenPR, onHide, dialog: screen.getByRole("dialog") };
}

const titles = (dialog: HTMLElement) =>
  ["Drop legacy serializer", "Calendar lazy-load", "WIP brand kit", "Bump boto3"].filter((t) =>
    within(dialog).queryByText(t),
  );

describe("ReviewQueueModal", () => {
  it("lists every PR grouped by state, drafts last", () => {
    const { dialog } = renderModal();
    const groups = within(dialog)
      .getAllByTestId("review-group")
      .map((el) => el.textContent?.replace(/\d+$/, ""));
    expect(groups).toEqual(["Needs a reviewer", "Waiting for review", "Draft"]);
    expect(titles(dialog)).toHaveLength(4);
  });

  it("shows the author and reviewers on one line", () => {
    const { dialog } = renderModal();
    const row = within(dialog).getByText("Calendar lazy-load").closest("button")!;
    expect(within(row).getByText("@outsider")).toBeInTheDocument();
    expect(within(row).getByText(/@tashfia, @nadman/)).toBeInTheDocument();
    const lonely = within(dialog).getByText("Bump boto3").closest("button")!;
    expect(within(lonely).getByText(/nobody yet/)).toBeInTheDocument();
  });

  it("searches title, repo#number, author and reviewers", () => {
    const { dialog } = renderModal();
    const search = within(dialog).getByPlaceholderText("Search PRs, people…");

    fireEvent.change(search, { target: { value: "serial" } });
    expect(titles(dialog)).toEqual(["Drop legacy serializer"]);

    fireEvent.change(search, { target: { value: "cmp-frontend#202" } });
    expect(titles(dialog)).toEqual(["Calendar lazy-load"]);

    fireEvent.change(search, { target: { value: "OUTSIDER" } });
    expect(titles(dialog)).toEqual(["Calendar lazy-load"]);

    fireEvent.change(search, { target: { value: "nadman" } });
    expect(titles(dialog)).toEqual([
      "Drop legacy serializer",
      "Calendar lazy-load",
      "WIP brand kit",
      "Bump boto3",
    ]);

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(within(dialog).getByText("No PRs match.")).toBeInTheDocument();
  });

  it("splits the team's own PRs from reviews asked of the team", () => {
    const { dialog } = renderModal();
    expect(within(dialog).getByText("asked of us")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /Our PRs/ }));
    expect(titles(dialog)).toEqual(["Drop legacy serializer", "WIP brand kit", "Bump boto3"]);

    fireEvent.click(within(dialog).getByRole("button", { name: /Asked of us/ }));
    expect(titles(dialog)).toEqual(["Calendar lazy-load"]);
  });

  it("closes and opens the PR when a row is clicked", () => {
    const { dialog, onOpenPR, onHide } = renderModal();
    fireEvent.click(within(dialog).getByText("Calendar lazy-load"));
    expect(onHide).toHaveBeenCalled();
    expect(onOpenPR).toHaveBeenCalledWith("newscred/cmp-frontend", 202);
  });
});
