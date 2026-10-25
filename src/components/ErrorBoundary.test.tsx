import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { trackEvent } from "../lib/analytics";
import { ErrorBoundary } from "./ErrorBoundary";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

function Boom(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("shows the error and logs it to analytics", () => {
    // React, jsdom and the boundary all report the thrown error; keep test output clean.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const swallow = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener("error", swallow);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(trackEvent).toHaveBeenCalledWith("error_boundary");
    window.removeEventListener("error", swallow);
    consoleError.mockRestore();
  });
});
