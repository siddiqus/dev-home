import { render, screen, fireEvent } from "@testing-library/react";
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
      />,
    );

    // Tashfia has stalledCount: 2
    expect(screen.getByText("2 stalled")).toBeInTheDocument();
    // Nadman has stalledCount: 0, so no stalled badge
    expect(screen.queryByText("0 stalled")).not.toBeInTheDocument();
  });

  it("marks members with flagged tickets with a warning icon instead of a label", () => {
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
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
      />,
    );

    expect(screen.queryByText(/Uneven load/)).not.toBeInTheDocument();
  });

  it("shows uneven load caption when imbalance >= 3", () => {
    const highImbalance: LoadBalance = { max: 10, min: 3, imbalance: 7 };
    render(<LoadDistribution workload={dashboardFixture.workload} loadBalance={highImbalance} />);

    expect(screen.getByText(/Uneven load · 7 ticket spread/)).toBeInTheDocument();
  });

  it("renders empty state when workload is empty", () => {
    render(<LoadDistribution workload={[]} loadBalance={{ max: 0, min: 0, imbalance: 0 }} />);

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
      />,
    );

    const names = screen.getAllByText(/^(Tashfia|Nadman)$/);
    expect(names[0]).toHaveTextContent("Tashfia");
    expect(names[1]).toHaveTextContent("Nadman");
  });

  it("uses the People list's row: WIP, done and PRs under the bar, no stalest link", () => {
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
      />,
    );

    expect(screen.getByRole("button", { name: /Tashfia/ })).toHaveTextContent(
      "WIP 4 · Done 2 · PRs 3/1",
    );
    expect(screen.queryByText(/stalest/)).not.toBeInTheDocument();
  });

  it("picks the member for the People tab when their row is clicked", () => {
    const onSelectMember = vi.fn();
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        onSelectMember={onSelectMember}
      />,
    );

    fireEvent.click(screen.getByText("Tashfia"));

    expect(onSelectMember).toHaveBeenCalledWith("u1");
  });
});
