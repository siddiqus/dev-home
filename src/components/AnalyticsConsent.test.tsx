import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Clarity from "@microsoft/clarity";
import { setAnalyticsConsent } from "../lib/analytics";
import { AnalyticsConsent } from "./AnalyticsConsent";
import { UsageAnalytics } from "../views/settings/UsageAnalytics";

vi.mock("@microsoft/clarity", () => ({
  default: { init: vi.fn(), consentV2: vi.fn(), setTag: vi.fn(), event: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubEnv("PROD", true);
  vi.stubEnv("VITE_CLARITY_PROJECT_ID", "proj");
});

afterEach(() => {
  // Reset the shared module so a started Clarity doesn't carry into the next test.
  setAnalyticsConsent("denied");
  vi.unstubAllEnvs();
});

const card = () => screen.queryByRole("dialog", { name: "Usage analytics" });

describe("AnalyticsConsent", () => {
  it("asks when the user hasn't chosen yet", () => {
    render(<AnalyticsConsent />);
    expect(card()).toBeInTheDocument();
  });

  it("stays hidden in builds without Clarity", () => {
    vi.stubEnv("VITE_CLARITY_PROJECT_ID", "");
    render(<AnalyticsConsent />);
    expect(card()).not.toBeInTheDocument();
  });

  it("stays hidden once the user has chosen", () => {
    localStorage.setItem("dev-home-analytics-consent", "denied");
    render(<AnalyticsConsent />);
    expect(card()).not.toBeInTheDocument();
  });

  it("Allow starts Clarity and hides the card", () => {
    render(<AnalyticsConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(Clarity.init).toHaveBeenCalledWith("proj");
    expect(card()).not.toBeInTheDocument();
  });

  it("Decline hides the card without loading Clarity", () => {
    render(<AnalyticsConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(Clarity.init).not.toHaveBeenCalled();
    expect(card()).not.toBeInTheDocument();
  });
});

describe("UsageAnalytics", () => {
  it("is off until granted, and the switch updates the card's answer too", () => {
    render(
      <>
        <AnalyticsConsent />
        <UsageAnalytics />
      </>,
    );
    const toggle = screen.getByLabelText("Share usage analytics");
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(Clarity.init).toHaveBeenCalledWith("proj");
    expect(card()).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem("dev-home-analytics-consent")).toBe("denied");
  });
});
