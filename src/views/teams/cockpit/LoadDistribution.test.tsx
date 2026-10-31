import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LoadDistribution } from "./LoadDistribution";
import dashboardFixture from "../__fixtures__/dashboardFixture";
import type { LoadBalance } from "../../../types/teams";

describe("LoadDistribution", () => {
  it("renders both members from fixture", () => {
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
      />,
    );

    expect(screen.getByText("Tashfia")).toBeInTheDocument();
    expect(screen.getByText("Nadman")).toBeInTheDocument();
  });

  it("shows stalled badge only for member with stalled count > 0", () => {
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
      />,
    );

    // Tashfia has stalledCount: 2
    expect(screen.getByText("Stalled: 2")).toBeInTheDocument();
    // Nadman has stalledCount: 0, so no stalled badge
    expect(screen.queryByText("Stalled: 0")).not.toBeInTheDocument();
  });

  it("marks members with flagged tickets with a warning icon instead of a label", () => {
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
      />,
    );

    // Tashfia has one "high" ticket: the icon's label says so on hover.
    expect(screen.getByLabelText("Check in: 1 ticket at risk")).toBeInTheDocument();
    // Nadman is on track: no icon. And no level words on any row.
    expect(screen.getAllByLabelText(/^Check in:/)).toHaveLength(1);
    expect(screen.queryByText("At risk")).not.toBeInTheDocument();
    expect(screen.queryByText("high")).not.toBeInTheDocument();
  });

  it("does NOT show uneven load caption when imbalance < 3", () => {
    // fixture.loadBalance.imbalance is 2
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
      />,
    );

    expect(screen.queryByText(/Uneven load/)).not.toBeInTheDocument();
  });

  it("shows uneven load caption when imbalance >= 3", () => {
    const highImbalance: LoadBalance = { max: 10, min: 3, imbalance: 7 };
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={highImbalance}
        issues={dashboardFixture.issues}
      />,
    );

    expect(screen.getByText(/Uneven load · 7 ticket spread/)).toBeInTheDocument();
  });

  it("calls onOpenRef with correct Ref when stalest link is clicked", () => {
    const onOpenRef = vi.fn();

    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
        onOpenRef={onOpenRef}
      />,
    );

    // Tashfia's stalest is { kind: "issue", key: "PLAT-101" }
    const stalestButton = screen.getByText("stalest: PLAT-101");
    fireEvent.click(stalestButton);

    expect(onOpenRef).toHaveBeenCalledWith({ kind: "issue", key: "PLAT-101" });
  });

  it("renders empty state when workload is empty", () => {
    render(
      <LoadDistribution workload={[]} loadBalance={{ max: 0, min: 0, imbalance: 0 }} issues={[]} />,
    );

    expect(screen.getByText("No team members")).toBeInTheDocument();
  });

  it("sorts members by risk/stalled/wip to surface who needs help", () => {
    // Tashfia: riskLevel=high, stalledCount=2, wip=4
    // Nadman: riskLevel=normal, stalledCount=0, wip=1
    // Tashfia should appear first
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
      />,
    );

    const names = screen.getAllByText(/^(Tashfia|Nadman)$/);
    expect(names[0]).toHaveTextContent("Tashfia");
    expect(names[1]).toHaveTextContent("Nadman");
  });

  it("shows day count on stalest link when staleDays map is provided", () => {
    const staleDaysMap = new Map([["PLAT-101", 4]]);
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
        staleDays={staleDaysMap}
      />,
    );

    expect(screen.getByText(/stalest: PLAT-101/)).toBeInTheDocument();
    expect(screen.getByText(/4d/)).toBeInTheDocument();
  });

  it("renders stalest link without day count when staleDays map is absent", () => {
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
      />,
    );

    expect(screen.getByText("stalest: PLAT-101")).toBeInTheDocument();
    expect(screen.queryByText(/\dd$/)).not.toBeInTheDocument();
  });

  it("opens the member modal with stat chips, ticket titles and plain-language signals", () => {
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
      />,
    );

    // Click Tashfia's row (name text bubbles to the row container's onClick).
    fireEvent.click(screen.getByText("Tashfia"));
    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveTextContent("7 tickets");
    expect(dialog).toHaveTextContent("4 in flight");
    expect(dialog).toHaveTextContent("2 stalled");
    expect(dialog).toHaveTextContent("3 open PRs · 1 waiting on reviewers · 1 merged");

    // The flagged ticket's card: key, title, and each warning sign in words.
    const atRisk = within(dialog).getByRole("region", { name: "At risk tickets" });
    expect(within(atRisk).getByText("PLAT-101")).toBeInTheDocument();
    expect(within(atRisk).getByText("Sprint health strip")).toBeInTheDocument();
    // Staleness shows as the card's last update, not as a signal line.
    expect(within(atRisk).getByText("updated 4d ago")).toBeInTheDocument();
    expect(within(atRisk).queryByText(/^No update for/)).not.toBeInTheDocument();
    expect(within(atRisk).getByText("PR #12 is failing CI")).toBeInTheDocument();
    expect(
      within(atRisk).getByText(/^PR #12 has waited \d+ days for a first review$/),
    ).toBeInTheDocument();
    expect(within(atRisk).getByText("Added after the sprint started")).toBeInTheDocument();
  });

  it("lists every ticket of the member grouped by status", () => {
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
      />,
    );

    fireEvent.click(screen.getByText("Tashfia"));
    const dialog = screen.getByRole("dialog");

    const inProgress = within(dialog).getByRole("region", { name: "In Progress tickets" });
    expect(within(inProgress).getByText("Sprint health strip")).toBeInTheDocument();
    // Other members' tickets stay out.
    expect(within(dialog).queryByText("Token refresh")).not.toBeInTheDocument();
  });

  it("says a member is on track when no ticket is flagged", () => {
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
      />,
    );

    fireEvent.click(screen.getByText("Nadman"));
    const dialog = screen.getByRole("dialog");

    // No level label beside the name.
    expect(within(dialog).queryByText("On track")).not.toBeInTheDocument();
    expect(within(dialog).getByText(/nothing needs a look/)).toBeInTheDocument();
    const done = within(dialog).getByRole("region", { name: "Done tickets" });
    expect(within(done).getByText("Token refresh")).toBeInTheDocument();
  });

  it("shows three done tickets and folds the rest behind a button", () => {
    const base = dashboardFixture.issues.find((i) => i.key === "PLAT-201")!;
    const done = [1, 2, 3, 4, 5].map((n) => ({
      ...base,
      key: `PLAT-90${n}`,
      summary: `Done thing ${n}`,
      daysSinceUpdate: n,
    }));
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={done}
      />,
    );

    fireEvent.click(screen.getByText("Nadman"));
    const group = within(screen.getByRole("dialog")).getByRole("region", { name: "Done tickets" });

    expect(within(group).getAllByText(/^Done thing/)).toHaveLength(3);
    fireEvent.click(within(group).getByRole("button", { name: "Show 2 more" }));
    expect(within(group).getAllByText(/^Done thing/)).toHaveLength(5);
  });

  it("opens a flagged ticket from the modal and closes it", () => {
    const onOpenRef = vi.fn();

    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        issues={dashboardFixture.issues}
        onOpenRef={onOpenRef}
      />,
    );

    fireEvent.click(screen.getByText("Tashfia"));
    const atRisk = within(screen.getByRole("dialog")).getByRole("region", {
      name: "At risk tickets",
    });
    fireEvent.click(within(atRisk).getByText("Sprint health strip"));

    expect(onOpenRef).toHaveBeenCalledWith({ kind: "issue", key: "PLAT-101" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
