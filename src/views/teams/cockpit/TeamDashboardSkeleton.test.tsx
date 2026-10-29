import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamDashboardSkeleton } from "./TeamDashboardSkeleton";

describe("TeamDashboardSkeleton", () => {
  it("marks itself busy for assistive tech", () => {
    render(<TeamDashboardSkeleton />);
    expect(screen.getByLabelText("Loading sprint data")).toHaveAttribute("aria-busy", "true");
  });
});
