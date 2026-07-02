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
      />
    );

    expect(screen.getByText("Tashfia")).toBeInTheDocument();
    expect(screen.getByText("Nadman")).toBeInTheDocument();
  });

  it("shows stalled badge only for member with stalled count > 0", () => {
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
      />
    );

    // Tashfia has stalledCount: 2
    expect(screen.getByText("Stalled: 2")).toBeInTheDocument();
    // Nadman has stalledCount: 0, so no stalled badge
    expect(screen.queryByText("Stalled: 0")).not.toBeInTheDocument();
  });

  it("reflects risk level for each member", () => {
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
      />
    );

    // Tashfia has riskLevel: "high"
    expect(screen.getByText("high")).toBeInTheDocument();
    // Nadman has riskLevel: "normal"
    expect(screen.getByText("normal")).toBeInTheDocument();
  });

  it("does NOT show uneven load caption when imbalance < 3", () => {
    // fixture.loadBalance.imbalance is 2
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
      />
    );

    expect(screen.queryByText(/Uneven load/)).not.toBeInTheDocument();
  });

  it("shows uneven load caption when imbalance >= 3", () => {
    const highImbalance: LoadBalance = { max: 10, min: 3, imbalance: 7 };
    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={highImbalance}
      />
    );

    expect(screen.getByText(/Uneven load · 7 ticket spread/)).toBeInTheDocument();
  });

  it("calls onOpenRef with correct Ref when stalest link is clicked", () => {
    const onOpenRef = vi.fn();

    render(
      <LoadDistribution
        workload={dashboardFixture.workload}
        loadBalance={dashboardFixture.loadBalance}
        onOpenRef={onOpenRef}
      />
    );

    // Tashfia's stalest is { kind: "issue", key: "PLAT-101" }
    const stalestButton = screen.getByText("stalest: PLAT-101");
    fireEvent.click(stalestButton);

    expect(onOpenRef).toHaveBeenCalledWith({ kind: "issue", key: "PLAT-101" });
  });

  it("renders empty state when workload is empty", () => {
    render(
      <LoadDistribution
        workload={[]}
        loadBalance={{ max: 0, min: 0, imbalance: 0 }}
      />
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
      />
    );

    const names = screen.getAllByText(/^(Tashfia|Nadman)$/);
    expect(names[0]).toHaveTextContent("Tashfia");
    expect(names[1]).toHaveTextContent("Nadman");
  });
});
