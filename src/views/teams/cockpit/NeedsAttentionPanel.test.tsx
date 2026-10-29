import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NeedsAttentionPanel } from "./NeedsAttentionPanel";
import { buildRefLookup } from "./refLookup";
import dashboardFixture from "../__fixtures__/dashboardFixture";
import type { NeedsAttention, Ref } from "../../../types/teams";

const lookup = buildRefLookup(dashboardFixture.issues, dashboardFixture.offBoardPRs);

function renderPanel(needsAttention: NeedsAttention = dashboardFixture.needsAttention) {
  const onOpenRef = vi.fn();
  render(
    <NeedsAttentionPanel needsAttention={needsAttention} lookup={lookup} onOpenRef={onOpenRef} />,
  );
  return onOpenRef;
}

describe("NeedsAttentionPanel", () => {
  it("lists the items of each group without expanding anything", () => {
    renderPanel();

    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("Waiting review > 24h")).toBeInTheDocument();
    expect(screen.getByText("PLAT-101")).toBeInTheDocument();
    expect(screen.getByText("Sprint health strip")).toBeInTheDocument();
    expect(screen.getByText("web#12")).toBeInTheDocument();
  });

  it("shows the author next to a PR waiting for review", () => {
    renderPanel();
    const row = screen.getByText("web#12").closest("button")!;
    expect(within(row).getByText("PLAT-101 health strip")).toBeInTheDocument();
    expect(within(row).getByText("@tashfia")).toBeInTheDocument();
  });

  it("shows the assignee and days without an update on a stale ticket", () => {
    renderPanel();
    const row = screen.getByText("PLAT-101").closest("button")!;
    expect(within(row).getByText("Tashfia")).toBeInTheDocument();
    expect(within(row).getByText("4d")).toBeInTheDocument();
  });

  it("opens the item that was clicked", () => {
    const onOpenRef = renderPanel();
    fireEvent.click(screen.getByText("web#12"));
    expect(onOpenRef).toHaveBeenCalledWith({ kind: "pr", repo: "acme/web", number: 12 });
  });

  it("lists every item in a group", () => {
    const stale: Ref[] = Array.from({ length: 7 }, (_, i) => ({
      kind: "issue",
      key: `PLAT-9${i}`,
    }));
    renderPanel({ stale, waitingReview: [] });
    expect(screen.getByText("PLAT-90")).toBeInTheDocument();
    expect(screen.getByText("PLAT-96")).toBeInTheDocument();
  });

  it("hides empty groups", () => {
    renderPanel({ ...dashboardFixture.needsAttention, waitingReview: [] });
    expect(screen.queryByText("Waiting review > 24h")).not.toBeInTheDocument();
  });

  it("shows an all-clear state when nothing needs attention", () => {
    renderPanel({ stale: [], waitingReview: [] });
    expect(screen.getByText("All clear — nothing needs attention")).toBeInTheDocument();
  });
});
