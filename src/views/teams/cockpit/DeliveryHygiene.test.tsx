import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DeliveryHygiene } from "./DeliveryHygiene";
import { buildRefLookup } from "./refLookup";
import dashboardFixture from "../__fixtures__/dashboardFixture";
import type { Hygiene } from "../../../types/teams";

const lookup = buildRefLookup(dashboardFixture.issues, dashboardFixture.offBoardPRs);

function renderHygiene(hygiene: Hygiene = dashboardFixture.hygiene) {
  const onOpenRef = vi.fn();
  render(<DeliveryHygiene hygiene={hygiene} lookup={lookup} onOpenRef={onOpenRef} />);
  return onOpenRef;
}

const toggle = (label: string) => screen.getByRole("button", { name: new RegExp(label) });

describe("DeliveryHygiene", () => {
  it("shows a collapsed row with a count for each non-empty signal", () => {
    renderHygiene();

    expect(screen.getByText("Delivery Hygiene")).toBeInTheDocument();
    for (const label of [
      "Failing CI",
      "Unassigned",
      "PRs without Jira",
      "Done without merged PR",
      "No epic",
      "Added mid-sprint",
    ]) {
      expect(toggle(label)).toHaveAttribute("aria-expanded", "false");
      expect(within(toggle(label)).getByText("1")).toBeInTheDocument();
    }
    expect(screen.queryByText("PLAT-201")).not.toBeInTheDocument();
  });

  it("hides zero-count rows", () => {
    renderHygiene();
    expect(screen.queryByText("In progress without a PR")).not.toBeInTheDocument();
    expect(screen.queryByText("Merged but not done")).not.toBeInTheDocument();
  });

  it("expands a row into items with title and author", () => {
    renderHygiene();
    fireEvent.click(toggle("PRs without Jira"));

    const row = screen.getByText("web#88").closest("button")!;
    expect(within(row).getByText("hotfix: logging")).toBeInTheDocument();
    expect(within(row).getByText("@nadman")).toBeInTheDocument();
  });

  it("keeps several rows open at once", () => {
    renderHygiene();
    fireEvent.click(toggle("PRs without Jira"));
    fireEvent.click(toggle("Done without merged PR"));

    expect(screen.getByText("web#88")).toBeInTheDocument();
    expect(screen.getByText("PLAT-201")).toBeInTheDocument();

    fireEvent.click(toggle("PRs without Jira"));
    expect(screen.queryByText("web#88")).not.toBeInTheDocument();
    expect(screen.getByText("PLAT-201")).toBeInTheDocument();
  });

  it("shows the status of an unassigned ticket, since nobody has it", () => {
    renderHygiene();
    fireEvent.click(toggle("Unassigned"));
    const row = screen.getByText("PLAT-301").closest("button")!;
    expect(within(row).getByText("Unassigned cleanup")).toBeInTheDocument();
    expect(within(row).getByText("To Do")).toBeInTheDocument();
  });

  it("opens the item that was clicked", () => {
    const onOpenRef = renderHygiene();
    fireEvent.click(toggle("Done without merged PR"));
    fireEvent.click(screen.getByText("PLAT-201"));
    expect(onOpenRef).toHaveBeenCalledWith({ kind: "issue", key: "PLAT-201" });
  });

  it("shows an all-clear message when every signal is empty", () => {
    renderHygiene({
      failingCI: [],
      unassigned: [],
      jiraNoPR: [],
      prNoJira: [],
      mergedNotDone: [],
      doneNoMerged: [],
      noEpic: [],
      addedMidSprint: [],
    });
    expect(screen.getByText("All linked up — no hygiene issues.")).toBeInTheDocument();
  });
});
