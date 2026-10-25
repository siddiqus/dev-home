import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Clarity from "@microsoft/clarity";

vi.mock("@microsoft/clarity", () => ({
  default: { init: vi.fn(), consentV2: vi.fn(), setTag: vi.fn(), event: vi.fn() },
}));

type Analytics = typeof import("./analytics");
let mod: Analytics | null = null;

// Module state (`started`) must start fresh per test.
async function load(): Promise<Analytics> {
  vi.resetModules();
  mod = await import("./analytics");
  return mod;
}

const clarityGlobal = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubEnv("PROD", true);
  vi.stubEnv("VITE_CLARITY_PROJECT_ID", "proj");
  (window as { clarity?: unknown }).clarity = clarityGlobal;
});

afterEach(() => {
  // Stop the module so its appinstalled listener can't leak into the next test.
  mod?.setAnalyticsConsent("denied");
  mod = null;
  vi.unstubAllEnvs();
  delete (window as { clarity?: unknown }).clarity;
});

describe("analytics", () => {
  it("loads nothing until the user opts in", async () => {
    const { initAnalytics, trackEvent, getAnalyticsConsent } = await load();
    initAnalytics();
    trackEvent("tab_prs");
    expect(getAnalyticsConsent()).toBeNull();
    expect(Clarity.init).not.toHaveBeenCalled();
    expect(Clarity.event).not.toHaveBeenCalled();
  });

  it("is unavailable outside production builds or without a project id", async () => {
    localStorage.setItem("dev-home-analytics-consent", "granted");
    vi.stubEnv("PROD", false);
    let a = await load();
    a.initAnalytics();
    expect(a.analyticsAvailable()).toBe(false);

    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_CLARITY_PROJECT_ID", "");
    a = await load();
    a.initAnalytics();
    expect(a.analyticsAvailable()).toBe(false);
    expect(Clarity.init).not.toHaveBeenCalled();
  });

  // One test: listeners from earlier module instances would skew the install count.
  it("starts at load after an earlier opt-in, tags the session and forwards events", async () => {
    localStorage.setItem("dev-home-analytics-consent", "granted");
    const { initAnalytics, trackEvent } = await load();
    initAnalytics();
    initAnalytics();
    trackEvent("tab_prs");
    expect(Clarity.init).toHaveBeenCalledTimes(1);
    expect(Clarity.init).toHaveBeenCalledWith("proj");
    expect(Clarity.consentV2).toHaveBeenCalledWith({
      ad_Storage: "denied",
      analytics_Storage: "granted",
    });
    expect(Clarity.setTag).toHaveBeenCalledWith("app_version", "test");
    expect(Clarity.setTag).toHaveBeenCalledWith("display_mode", "browser");
    expect(Clarity.event).toHaveBeenCalledWith("tab_prs");

    vi.mocked(Clarity.event).mockClear();
    window.dispatchEvent(new Event("appinstalled"));
    expect(Clarity.event).toHaveBeenCalledTimes(1);
    expect(Clarity.event).toHaveBeenCalledWith("pwa_installed");
  });

  it("granting starts right away, persists and notifies subscribers", async () => {
    const { setAnalyticsConsent, subscribeAnalyticsConsent, getAnalyticsConsent } = await load();
    const listener = vi.fn();
    subscribeAnalyticsConsent(listener);
    setAnalyticsConsent("granted");
    expect(Clarity.init).toHaveBeenCalledWith("proj");
    expect(getAnalyticsConsent()).toBe("granted");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("declining never loads Clarity", async () => {
    const { setAnalyticsConsent, initAnalytics, getAnalyticsConsent } = await load();
    setAnalyticsConsent("denied");
    initAnalytics();
    expect(getAnalyticsConsent()).toBe("denied");
    expect(Clarity.init).not.toHaveBeenCalled();
    expect(clarityGlobal).not.toHaveBeenCalled();
  });

  it("withdrawing clears cookies, stops recording and silences events", async () => {
    const { setAnalyticsConsent, trackEvent } = await load();
    setAnalyticsConsent("granted");
    vi.mocked(Clarity.event).mockClear();

    setAnalyticsConsent("denied");
    expect(Clarity.consentV2).toHaveBeenLastCalledWith({
      ad_Storage: "denied",
      analytics_Storage: "denied",
    });
    expect(clarityGlobal).toHaveBeenCalledWith("stop");
    trackEvent("tab_prs");
    window.dispatchEvent(new Event("appinstalled"));
    expect(Clarity.event).not.toHaveBeenCalled();
  });
});
