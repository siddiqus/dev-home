import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { GitHubPR } from "../../types";
import { ViewerLoginContext } from "../../context/ViewerLoginContext";
import { MergeProvider } from "../../context/MergeContext";
import { DeckPRRow } from "./DeckPRRow";
import type { DeckPR, Signal } from "./deckTypes";

const NOW = new Date("2026-10-14T12:00:00Z");

function item(p: Partial<GitHubPR>, signals: Signal[]): DeckPR {
  return {
    pr: {
      id: 7,
      number: 7,
      title: "CCP-1 Ship it",
      html_url: "https://github.com/o/r/pull/7",
      state: "open",
      draft: false,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-14T10:00:00Z",
      user: { login: "me", avatar_url: "" },
      head: { ref: "b-7", sha: "abc" },
      base: { ref: "main" },
      repo_full_name: "o/r",
      checks_status: "SUCCESS",
      checks: [],
      review_status: "APPROVED",
      requested_reviewers: [],
      ...p,
    },
    mine: true,
    signals,
    priority: 3,
    unseenComment: null,
    note: null,
    current: false,
    unseen: false,
  };
}

function renderRow(row: DeckPR) {
  const onSelect = vi.fn();
  const onOpen = vi.fn();
  render(
    <ViewerLoginContext.Provider value="me">
      <MergeProvider>
        <DeckPRRow
          id="row"
          item={row}
          ticketKey="CCP-1"
          selected={false}
          now={NOW}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      </MergeProvider>
    </ViewerLoginContext.Provider>,
  );
  return { onSelect, onOpen };
}

describe("DeckPRRow merge button", () => {
  it("turns my ready PR's first chip into the Merge button, keeping the other chips", () => {
    const { onSelect, onOpen } = renderRow(
      item({}, [
        { label: "✓ Ready to merge", tone: "success" },
        { label: "1 open thread", tone: "warning" },
      ]),
    );
    expect(screen.queryByText("✓ Ready to merge")).not.toBeInTheDocument();
    expect(screen.getByText("1 open thread")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("keeps the chip while the PR isn't ready", () => {
    renderRow(
      item({ checks_status: "PENDING" }, [
        { label: "✓ Approved · merge when CI passes", tone: "success" },
      ]),
    );
    expect(screen.getByText("✓ Approved · merge when CI passes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();
  });
});
