import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompletionChart } from "./CompletionChart";
import dashboardFixture from "../__fixtures__/dashboardFixture";
import type { Burnup } from "../../../types/teams";

describe("CompletionChart", () => {
  it("renders header and caption with fixture burnup data", () => {
    render(<CompletionChart burnup={dashboardFixture.burnup} />);
    expect(screen.getByText("Completion over time")).toBeInTheDocument();
    expect(screen.getByText("tracking since 2026-06-28")).toBeInTheDocument();
  });

  it("renders empty state when no tracking data", () => {
    const emptyBurnup: Burnup = { trackingSince: null, points: [] };
    render(<CompletionChart burnup={emptyBurnup} />);
    expect(screen.getByText("Completion over time")).toBeInTheDocument();
    expect(screen.getByText("Burn-up starts tracking from the next sync.")).toBeInTheDocument();
  });
});
