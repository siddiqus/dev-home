import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SprintMetaBar, sprintBoardUrl } from "./SprintMetaBar";
import dashboardFixture from "../__fixtures__/dashboardFixture";

describe("SprintMetaBar", () => {
  it("puts the sprint's facts on the left and its progress on the right", () => {
    const { container } = render(
      <SprintMetaBar sprint={dashboardFixture.sprint} pace={dashboardFixture.pace} />,
    );

    const [left, right] = Array.from(container.firstElementChild!.children);
    expect(left).toHaveTextContent("Day 6 of 14");
    // Date range (Jun 26 – Jul 10)
    expect(left).toHaveTextContent(/Jun 26 – Jul 10/);
    expect(left).toHaveTextContent("12 tickets in the sprint");
    expect(right).toHaveTextContent("33% done");
    expect(right).toHaveTextContent("Behind pace");
  });

  it("shows the total tickets, with what's left in the tooltip", () => {
    render(<SprintMetaBar sprint={dashboardFixture.sprint} pace={dashboardFixture.pace} />);

    expect(screen.getByTitle("8 left")).toHaveTextContent("12 tickets in the sprint");
    expect(screen.queryByText(/tickets left/)).not.toBeInTheDocument();
  });

  it("leaves the sprint name to the picker", () => {
    render(<SprintMetaBar sprint={dashboardFixture.sprint} pace={dashboardFixture.pace} />);

    expect(screen.queryByText("Sprint 24")).not.toBeInTheDocument();
  });

  it("leads with what it's given, ahead of the facts and progress", () => {
    const { container } = render(
      <SprintMetaBar sprint={dashboardFixture.sprint} pace={dashboardFixture.pace}>
        <button type="button">Overview</button>
      </SprintMetaBar>,
    );

    const [lead, facts, progress] = Array.from(container.firstElementChild!.children);
    expect(lead).toHaveTextContent("Overview");
    expect(facts).toHaveTextContent("Day 6 of 14");
    expect(progress).toHaveTextContent("33% done");
  });

  it("keeps what it leads with when there's no sprint", () => {
    render(
      <SprintMetaBar sprint={null} pace={dashboardFixture.pace}>
        <button type="button">Overview</button>
      </SprintMetaBar>,
    );

    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
  });

  it("puts the goal in the facts' tooltip instead of the line", () => {
    const { container } = render(
      <SprintMetaBar sprint={dashboardFixture.sprint} pace={dashboardFixture.pace}>
        <button type="button">Overview</button>
      </SprintMetaBar>,
    );

    expect(screen.getByText("Day 6 of 14").parentElement).toHaveAttribute(
      "title",
      "Goal: Ship the sprint cockpit",
    );
    // Not the whole strip, or hovering the switch would show it too.
    expect(container.firstElementChild).not.toHaveAttribute("title");
    expect(screen.queryByText("Ship the sprint cockpit")).not.toBeInTheDocument();
  });

  it("has no tooltip when the sprint has no goal", () => {
    const sprintNoGoal = { ...dashboardFixture.sprint!, goal: undefined };
    render(<SprintMetaBar sprint={sprintNoGoal} pace={dashboardFixture.pace} />);

    expect(screen.getByText("Day 6 of 14").parentElement).not.toHaveAttribute("title");
  });

  it("skips the date range when the sprint has no dates", () => {
    const undated = { ...dashboardFixture.sprint!, startDate: undefined, endDate: undefined };
    render(<SprintMetaBar sprint={undated} pace={dashboardFixture.pace} />);

    expect(screen.getByText("Day 6 of 14")).toBeInTheDocument();
    expect(screen.queryByText(/Jun 26/)).not.toBeInTheDocument();
  });

  it("leaves 'No active sprint' to the toolbar when sprint is null", () => {
    render(<SprintMetaBar sprint={null} pace={dashboardFixture.pace} />);

    expect(screen.queryByText("No active sprint")).not.toBeInTheDocument();
    expect(screen.queryByText(/done/)).not.toBeInTheDocument();
  });
});

describe("sprintBoardUrl", () => {
  it("links to the sprint on the team's board", () => {
    expect(sprintBoardUrl("https://acme.atlassian.net/", 42, 1001)).toBe(
      "https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=42&view=detail&selectedSprint=1001",
    );
  });

  it("is null without a Jira base URL, board or sprint", () => {
    expect(sprintBoardUrl(undefined, 42, 1001)).toBeNull();
    expect(sprintBoardUrl("https://acme.atlassian.net", null, 1001)).toBeNull();
    expect(sprintBoardUrl("https://acme.atlassian.net", 42, null)).toBeNull();
  });
});
