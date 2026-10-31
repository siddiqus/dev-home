import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnTrackStrip } from "./OnTrackStrip";
import dashboardFixture from "../__fixtures__/dashboardFixture";

describe("OnTrackStrip", () => {
  it("says done and time elapsed in words, with no bars", () => {
    const { pace } = dashboardFixture;

    const { container } = render(<OnTrackStrip pace={pace} />);

    expect(container).toHaveTextContent("33% done");
    expect(container).toHaveTextContent("43% time elapsed");
    expect(container.querySelector("[style*='width']")).toBeNull();
  });

  it("shows a Behind pace pill when behind", () => {
    render(<OnTrackStrip pace={dashboardFixture.pace} />);

    expect(screen.getByText("Behind pace")).toHaveClass("sprint-strip__pace--behind");
  });

  it("shows an On track pill when not behind pace", () => {
    const pace = { ...dashboardFixture.pace, behindPace: false };

    render(<OnTrackStrip pace={pace} />);

    expect(screen.getByText("On track")).toHaveClass("sprint-strip__pace--ok");
    expect(screen.queryByText("Behind pace")).not.toBeInTheDocument();
  });
});
