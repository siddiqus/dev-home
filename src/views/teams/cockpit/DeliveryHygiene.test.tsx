import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeliveryHygiene } from "./DeliveryHygiene";
import dashboardFixture from "../__fixtures__/dashboardFixture";
import type { Hygiene } from "../../../types/teams";

describe("DeliveryHygiene", () => {
  it("renders all four hygiene rows with counts from fixture", () => {
    const onOpenRef = vi.fn();
    render(<DeliveryHygiene hygiene={dashboardFixture.hygiene} onOpenRef={onOpenRef} />);

    expect(screen.getByText("DELIVERY HYGIENE")).toBeInTheDocument();
    expect(screen.getByText("PRs without Jira")).toBeInTheDocument();
    expect(screen.getByText("Jira without PR")).toBeInTheDocument();
    // "Merged but not done" should be hidden (0 count)
    expect(screen.queryByText("Merged but not done")).not.toBeInTheDocument();
    expect(screen.getByText("Done without merged PR")).toBeInTheDocument();

    // Verify counts: prNoJira=1, jiraNoPR=1, doneNoMerged=1
    expect(screen.getAllByText("1")).toHaveLength(3);
  });

  it("expands a row to reveal refs", () => {
    const onOpenRef = vi.fn();
    render(<DeliveryHygiene hygiene={dashboardFixture.hygiene} onOpenRef={onOpenRef} />);

    // Expand "PRs without Jira" row
    const row = screen.getByText("PRs without Jira").closest("div");
    fireEvent.click(row!);

    // Ref should now be visible
    expect(screen.getByText("acme/web#88")).toBeInTheDocument();
  });

  it("clicking a ref calls onOpenRef with the correct Ref", () => {
    const onOpenRef = vi.fn();
    render(<DeliveryHygiene hygiene={dashboardFixture.hygiene} onOpenRef={onOpenRef} />);

    // Expand "PRs without Jira" row
    const row = screen.getByText("PRs without Jira").closest("div");
    fireEvent.click(row!);

    // Click the ref
    const refButton = screen.getByText("acme/web#88");
    fireEvent.click(refButton);

    expect(onOpenRef).toHaveBeenCalledWith({
      kind: "pr",
      repo: "acme/web",
      number: 88,
    });
  });

  it("clicking an issue ref calls onOpenRef with the correct Ref", () => {
    const onOpenRef = vi.fn();
    render(<DeliveryHygiene hygiene={dashboardFixture.hygiene} onOpenRef={onOpenRef} />);

    // Expand "Jira without PR" row
    const row = screen.getByText("Jira without PR").closest("div");
    fireEvent.click(row!);

    // Click the ref
    const refButton = screen.getByText("PLAT-101");
    fireEvent.click(refButton);

    expect(onOpenRef).toHaveBeenCalledWith({
      kind: "issue",
      key: "PLAT-101",
    });
  });

  it("shows all-clear message when all arrays are empty", () => {
    const emptyHygiene: Hygiene = {
      prNoJira: [],
      jiraNoPR: [],
      mergedNotDone: [],
      doneNoMerged: [],
    };
    render(<DeliveryHygiene hygiene={emptyHygiene} />);

    expect(screen.getByText("All linked up — no hygiene issues.")).toBeInTheDocument();
    expect(screen.queryByText("PRs without Jira")).not.toBeInTheDocument();
  });

  it("hides zero-count rows", () => {
    const onOpenRef = vi.fn();
    render(<DeliveryHygiene hygiene={dashboardFixture.hygiene} onOpenRef={onOpenRef} />);

    // "Merged but not done" has 0 count in fixture - should not be in document
    expect(screen.queryByText("Merged but not done")).not.toBeInTheDocument();
  });
});
