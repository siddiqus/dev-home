import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionBanner, RECONNECTED_DISMISS_MS } from "./ConnectionBanner";

function setOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}

function fire(event: "online" | "offline") {
  act(() => {
    window.dispatchEvent(new Event(event));
  });
}

describe("ConnectionBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("is hidden while online", () => {
    setOnline(true);
    render(<ConnectionBanner />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the offline bar when starting offline", () => {
    setOnline(false);
    render(<ConnectionBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("No internet connection");
  });

  it("shows offline, then reconnected, then dismisses after 2s", () => {
    setOnline(true);
    render(<ConnectionBanner />);

    fire("offline");
    expect(screen.getByRole("alert")).toHaveTextContent("No internet connection");

    fire("online");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Reconnected");

    act(() => {
      vi.advanceTimersByTime(RECONNECTED_DISMISS_MS - 1);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not flash reconnected on a stray online event", () => {
    setOnline(true);
    render(<ConnectionBanner />);
    fire("online");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
