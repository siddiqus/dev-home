import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NeedsAttentionPanel } from "./NeedsAttentionPanel";
import dashboardFixture from "../__fixtures__/dashboardFixture";
import type { NeedsAttention } from "../../../types/teams";

describe("NeedsAttentionPanel", () => {
  it("renders signal rows with correct counts", () => {
    const onOpenRef = vi.fn();
    render(
      <NeedsAttentionPanel
        needsAttention={dashboardFixture.needsAttention}
        onOpenRef={onOpenRef}
      />,
    );

    expect(screen.getByText("Needs Attention")).toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("Waiting review > 24h")).toBeInTheDocument();
    expect(screen.getByText("Failing CI")).toBeInTheDocument();

    // Verify counts via badges
    const staleRow = screen.getByText("Stale").closest("div");
    expect(staleRow?.textContent).toContain("1");
  });

  it("expands a row to reveal refs when clicked", () => {
    const onOpenRef = vi.fn();

    render(
      <NeedsAttentionPanel
        needsAttention={dashboardFixture.needsAttention}
        onOpenRef={onOpenRef}
      />,
    );

    const staleRow = screen.getByText("Stale").closest("div");
    expect(staleRow).toBeInTheDocument();

    fireEvent.click(staleRow!);

    expect(screen.getByText("PLAT-101")).toBeInTheDocument();
  });

  it("calls onOpenRef with the correct ref when a ref is clicked", () => {
    const onOpenRef = vi.fn();

    render(
      <NeedsAttentionPanel
        needsAttention={dashboardFixture.needsAttention}
        onOpenRef={onOpenRef}
      />,
    );

    const staleRow = screen.getByText("Stale").closest("div");
    fireEvent.click(staleRow!);

    const refButton = screen.getByText("PLAT-101");
    fireEvent.click(refButton);

    expect(onOpenRef).toHaveBeenCalledWith({ kind: "issue", key: "PLAT-101" });
  });

  it("shows all-clear state when all signals are empty", () => {
    const emptyNeedsAttention: NeedsAttention = {
      stale: [],
      waitingReview: [],
      failingCI: [],
      noLinkedPR: [],
      offBoard: [],
      scopeCreep: [],
      unassigned: [],
      noEpic: [],
    };

    render(<NeedsAttentionPanel needsAttention={emptyNeedsAttention} />);

    expect(screen.getByText("All clear — nothing needs attention")).toBeInTheDocument();
  });

  it("formats PR refs correctly", () => {
    const onOpenRef = vi.fn();

    render(
      <NeedsAttentionPanel
        needsAttention={dashboardFixture.needsAttention}
        onOpenRef={onOpenRef}
      />,
    );

    const waitingReviewRow = screen.getByText("Waiting review > 24h").closest("div");
    fireEvent.click(waitingReviewRow!);

    expect(screen.getByText("acme/web#12")).toBeInTheDocument();
  });

  it("hides rows with count 0", () => {
    const onOpenRef = vi.fn();
    render(
      <NeedsAttentionPanel
        needsAttention={dashboardFixture.needsAttention}
        onOpenRef={onOpenRef}
      />,
    );

    expect(screen.queryByText("No linked PR")).not.toBeInTheDocument();
  });

  it("shows staleness detail on stale chips when staleDays map is provided", () => {
    const staleDaysMap = new Map([["PLAT-101", 4]]);
    render(
      <NeedsAttentionPanel
        needsAttention={dashboardFixture.needsAttention}
        staleDays={staleDaysMap}
      />,
    );

    const staleRow = screen.getByText("Stale").closest("div");
    fireEvent.click(staleRow!);

    expect(screen.getByText(/No update/)).toBeInTheDocument();
    expect(screen.getByText(/4d/)).toBeInTheDocument();
  });

  it("renders stale chips without staleness detail when staleDays map is absent", () => {
    render(<NeedsAttentionPanel needsAttention={dashboardFixture.needsAttention} />);

    const staleRow = screen.getByText("Stale").closest("div");
    fireEvent.click(staleRow!);

    expect(screen.getByText("PLAT-101")).toBeInTheDocument();
    expect(screen.queryByText(/No update/)).not.toBeInTheDocument();
  });
});
