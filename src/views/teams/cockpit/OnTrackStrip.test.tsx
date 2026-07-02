import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnTrackStrip } from "./OnTrackStrip";
import dashboardFixture from "../__fixtures__/dashboardFixture";

describe("OnTrackStrip", () => {
  it("renders completion vs time with percentages and behind-pace badge", () => {
    const { pace, scope } = dashboardFixture;
    const offBoardCount = dashboardFixture.offBoardPRs.length;

    render(<OnTrackStrip pace={pace} scope={scope} offBoardCount={offBoardCount} />);

    // Hero card: percentages
    expect(screen.getByText(/33% done · 43% elapsed/)).toBeInTheDocument();
    // Behind pace badge (from fixture: behindPace = true)
    expect(screen.getByText("Behind pace")).toBeInTheDocument();
    // Day info
    expect(screen.getByText(/Day 6 of 14/)).toBeInTheDocument();
  });

  it("renders remaining count from pace data", () => {
    const { pace, scope } = dashboardFixture;
    const offBoardCount = dashboardFixture.offBoardPRs.length;

    render(<OnTrackStrip pace={pace} scope={scope} offBoardCount={offBoardCount} />);

    // Remaining: 8 of 12
    expect(screen.getByText(/8/)).toBeInTheDocument();
    expect(screen.getByText(/of 12/)).toBeInTheDocument();
    expect(screen.getByText("tickets left")).toBeInTheDocument();
  });

  it("renders scope change with added count", () => {
    const { pace, scope } = dashboardFixture;
    const offBoardCount = dashboardFixture.offBoardPRs.length;

    render(<OnTrackStrip pace={pace} scope={scope} offBoardCount={offBoardCount} />);

    // Scope: +2 added
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("added after start")).toBeInTheDocument();
  });

  it("renders off-board PR count", () => {
    const { pace, scope } = dashboardFixture;
    const offBoardCount = dashboardFixture.offBoardPRs.length;

    render(<OnTrackStrip pace={pace} scope={scope} offBoardCount={offBoardCount} />);

    // Off-board: 1 (from fixture)
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("not linked to sprint")).toBeInTheDocument();
  });

  it("shows On track badge when not behind pace", () => {
    const { scope } = dashboardFixture;
    const pace = { ...dashboardFixture.pace, behindPace: false };
    const offBoardCount = 0;

    render(<OnTrackStrip pace={pace} scope={scope} offBoardCount={offBoardCount} />);

    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.queryByText("Behind pace")).not.toBeInTheDocument();
  });

  it("applies warning styling when scope > 0", () => {
    const { pace } = dashboardFixture;
    const scope = { addedCount: 3, addedSP: 8 };
    const offBoardCount = 0;

    render(<OnTrackStrip pace={pace} scope={scope} offBoardCount={offBoardCount} />);

    // The scope card should have warning background
    // The card contains both the value and the caption
    const caption = screen.getByText("added after start");
    const scopeCard = caption.parentElement; // caption div -> card div
    expect(scopeCard).toHaveClass("bg-warning");
    expect(scopeCard).toHaveClass("bg-opacity-10");

    // Verify the value also gets warning color
    const scopeValue = screen.getByText("+3");
    expect(scopeValue).toHaveClass("text-warning");
  });

  it("applies muted styling when scope = 0", () => {
    const { pace } = dashboardFixture;
    const scope = { addedCount: 0 };
    const offBoardCount = 0;

    render(<OnTrackStrip pace={pace} scope={scope} offBoardCount={offBoardCount} />);

    const scopeValue = screen.getByText("+0");
    expect(scopeValue).toHaveClass("text-muted");
  });
});
