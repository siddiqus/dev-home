import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnTrackStrip } from "./OnTrackStrip";
import dashboardFixture from "../__fixtures__/dashboardFixture";

describe("OnTrackStrip", () => {
  it("renders completion vs time with percentages and behind-pace badge", () => {
    const { pace } = dashboardFixture;

    render(<OnTrackStrip pace={pace} />);

    // Hero: percentages
    expect(screen.getByText(/33% done · 43% elapsed/)).toBeInTheDocument();
    // Behind pace badge (from fixture: behindPace = true)
    expect(screen.getByText("Behind pace")).toBeInTheDocument();
  });

  it("renders remaining count from pace data", () => {
    const { pace } = dashboardFixture;

    render(<OnTrackStrip pace={pace} />);

    // Remaining: 8 of 12
    expect(screen.getByText(/8/)).toBeInTheDocument();
    expect(screen.getByText(/of 12/)).toBeInTheDocument();
    expect(screen.getByText("tickets left")).toBeInTheDocument();
  });

  it("shows On track badge when not behind pace", () => {
    const pace = { ...dashboardFixture.pace, behindPace: false };

    render(<OnTrackStrip pace={pace} />);

    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.queryByText("Behind pace")).not.toBeInTheDocument();
  });
});
