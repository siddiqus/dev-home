import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "../lib/analytics";
import { UpdateToast } from "./UpdateToast";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

const updateServiceWorker = vi.fn(async () => {});
let initialNeedRefresh = false;

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => {
    const needRefresh = useState(initialNeedRefresh);
    const offlineReady = useState(false);
    return { needRefresh, offlineReady, updateServiceWorker };
  },
}));

describe("UpdateToast", () => {
  beforeEach(() => {
    updateServiceWorker.mockClear();
    vi.mocked(trackEvent).mockClear();
    initialNeedRefresh = false;
  });

  it("is hidden when no new version is waiting", () => {
    render(<UpdateToast />);
    expect(screen.queryByText("New version available")).not.toBeInTheDocument();
  });

  it("shows when a new version is waiting", () => {
    initialNeedRefresh = true;
    render(<UpdateToast />);
    expect(screen.getByRole("status")).toHaveTextContent("New version available");
  });

  it("Reload activates the waiting worker", () => {
    initialNeedRefresh = true;
    render(<UpdateToast />);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(trackEvent).toHaveBeenCalledWith("update_reload");
  });

  it("dismiss hides it without updating", () => {
    initialNeedRefresh = true;
    render(<UpdateToast />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("New version available")).not.toBeInTheDocument();
    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
