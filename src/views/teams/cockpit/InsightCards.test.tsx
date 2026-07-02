import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InsightCards } from "./InsightCards";
import dashboardFixture from "../__fixtures__/dashboardFixture";

describe("InsightCards", () => {
  it("renders insights from fixture with correct titles and severity styling", () => {
    const { container } = render(<InsightCards insights={dashboardFixture.insights} />);

    // Assert all fixture insights are present
    expect(screen.getByText("Behind Pace")).toBeInTheDocument();
    expect(screen.getByText("Stale Work")).toBeInTheDocument();
    expect(screen.getByText("Review Bottleneck")).toBeInTheDocument();

    // Assert details are present
    expect(screen.getByText("43% elapsed, 33% of tickets done.")).toBeInTheDocument();
    expect(screen.getByText("1 ticket has had no movement > 2 days.")).toBeInTheDocument();
    expect(screen.getByText("1 PR waiting for review > 24h.")).toBeInTheDocument();

    // Assert severity badges
    const warnBadges = screen.getAllByText("WARN");
    expect(warnBadges.length).toBe(2); // Two warn insights in fixture
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();

    // Assert severity styling via border classes
    const cards = container.querySelectorAll(".border");
    expect(cards.length).toBeGreaterThan(0);

    // Find the critical card by matching its content
    const criticalCard = Array.from(cards).find((card) =>
      card.textContent?.includes("Stale Work"),
    );
    expect(criticalCard).toBeDefined();
    expect(criticalCard?.classList.contains("border-danger")).toBe(true);

    // Find a warn card
    const warnCard = Array.from(cards).find((card) => card.textContent?.includes("Behind Pace"));
    expect(warnCard).toBeDefined();
    expect(warnCard?.classList.contains("border-warning")).toBe(true);
  });

  it("renders nothing when insights array is empty", () => {
    const { container } = render(<InsightCards insights={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("applies correct styling for info severity", () => {
    const infoInsight = [
      { key: "test-info", severity: "info" as const, title: "Info Alert", detail: "Some info." },
    ];
    const { container } = render(<InsightCards insights={infoInsight} />);

    expect(screen.getByText("Info Alert")).toBeInTheDocument();
    expect(screen.getByText("INFO")).toBeInTheDocument();

    const card = container.querySelector(".border-info");
    expect(card).toBeTruthy();
  });
});
