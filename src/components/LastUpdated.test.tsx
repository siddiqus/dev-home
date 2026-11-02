import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LastUpdated } from "./LastUpdated";

describe("LastUpdated", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("says how long ago the data was synced", () => {
    render(<LastUpdated at="2026-11-02T11:55:00Z" />);
    expect(screen.getByText("Last updated 5m ago")).toBeInTheDocument();
  });

  it("keeps the label current as time passes", () => {
    render(<LastUpdated at="2026-11-02T11:59:30Z" />);
    expect(screen.getByText("Last updated just now")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });
    expect(screen.getByText("Last updated 2m ago")).toBeInTheDocument();
  });

  it("shows the exact time on hover", () => {
    render(<LastUpdated at="2026-11-02T11:55:00Z" />);
    const time = new Date("2026-11-02T11:55:00Z").toLocaleString();
    expect(screen.getByText("Last updated 5m ago")).toHaveAttribute(
      "title",
      `Last updated ${time}`,
    );
  });

  it("says it's updating while a refresh is in flight", () => {
    render(<LastUpdated at="2026-11-02T11:55:00Z" updating />);
    expect(screen.getByText("Updating…")).toBeInTheDocument();
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });

  it("renders nothing with no timestamp and no refresh", () => {
    const { container } = render(<LastUpdated at={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
