import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SprintMetaBar } from "./SprintMetaBar";
import dashboardFixture from "../__fixtures__/dashboardFixture";

describe("SprintMetaBar", () => {
  it("renders sprint name, date range, day of sprint, and goal from fixture", () => {
    render(
      <SprintMetaBar
        sprint={dashboardFixture.sprint}
        pace={dashboardFixture.pace}
        lastSynced={null}
      />,
    );

    // Sprint name
    expect(screen.getByText("Sprint 24")).toBeInTheDocument();

    // Date range (Jun 26 – Jul 10)
    expect(screen.getByText(/Jun 26/)).toBeInTheDocument();
    expect(screen.getByText(/Jul 10/)).toBeInTheDocument();

    // Day of sprint
    expect(screen.getByText("Day 6 of 14")).toBeInTheDocument();

    // Goal
    expect(screen.getByText("Ship the sprint cockpit")).toBeInTheDocument();
  });

  it("renders 'No active sprint' when sprint is null", () => {
    render(<SprintMetaBar sprint={null} pace={dashboardFixture.pace} lastSynced={null} />);

    expect(screen.getByText("No active sprint")).toBeInTheDocument();
    expect(screen.queryByText("Sprint 24")).not.toBeInTheDocument();
  });

  it("renders last synced time when provided", () => {
    // Use a recent timestamp (a few minutes ago)
    const recentTime = new Date(Date.now() - 5 * 60000).toISOString();

    render(
      <SprintMetaBar
        sprint={dashboardFixture.sprint}
        pace={dashboardFixture.pace}
        lastSynced={recentTime}
      />,
    );

    expect(screen.getByText(/Last synced/)).toBeInTheDocument();
    expect(screen.getByText(/5 minutes ago/)).toBeInTheDocument();
  });

  it("does not render last synced when not provided", () => {
    render(
      <SprintMetaBar sprint={dashboardFixture.sprint} pace={dashboardFixture.pace} lastSynced={null} />,
    );

    expect(screen.queryByText(/Last synced/)).not.toBeInTheDocument();
  });

  it("handles sprint without goal gracefully", () => {
    const sprintNoGoal = { ...dashboardFixture.sprint!, goal: undefined };

    render(
      <SprintMetaBar sprint={sprintNoGoal} pace={dashboardFixture.pace} lastSynced={null} />,
    );

    expect(screen.getByText("Sprint 24")).toBeInTheDocument();
    expect(screen.getByText("Day 6 of 14")).toBeInTheDocument();
    expect(screen.queryByText("Ship the sprint cockpit")).not.toBeInTheDocument();
  });
});
