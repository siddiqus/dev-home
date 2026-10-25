import Clarity from "@microsoft/clarity";

/**
 * Microsoft Clarity, opt-in. It only exists in production builds compiled with
 * VITE_CLARITY_PROJECT_ID (dev servers, forks and self-hosted builds send nothing), and the
 * script isn't loaded until the user allows it. The npm wrapper calls window.clarity
 * directly, which doesn't exist until init runs, so every helper is a no-op until then.
 */

export type AnalyticsConsent = "granted" | "denied";

// Outside DB_PREFIX on purpose: consent belongs to this browser, so backups don't carry it.
const CONSENT_KEY = "dev-home-analytics-consent";

let started = false;
const listeners = new Set<() => void>();

function projectId(): string | undefined {
  if (!import.meta.env.PROD) return undefined;
  return (import.meta.env?.VITE_CLARITY_PROJECT_ID as string | undefined) || undefined;
}

/** Whether this build ships analytics at all; the consent UI hides when it doesn't. */
export function analyticsAvailable(): boolean {
  return !!projectId();
}

/** The user's stored choice, or null if they haven't made one. */
export function getAnalyticsConsent(): AnalyticsConsent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Stores the user's choice. Granting starts Clarity right away. Withdrawing clears its
 * cookies and stops recording; re-granting after that resumes on the next page load,
 * since Clarity can't restart in place.
 */
export function setAnalyticsConsent(consent: AnalyticsConsent): void {
  try {
    localStorage.setItem(CONSENT_KEY, consent);
  } catch {
    // ignore quota errors
  }
  if (consent === "granted") start();
  else stop();
  listeners.forEach((listener) => listener());
}

export function subscribeAnalyticsConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts Clarity at app load if the user opted in on an earlier visit. */
export function initAnalytics(): void {
  if (getAnalyticsConsent() === "granted") start();
}

/** Logs a custom event; it shows up alongside Clarity's smart events and in filters. */
export function trackEvent(name: string): void {
  if (started) Clarity.event(name);
}

const onInstalled = () => trackEvent("pwa_installed");

function start(): void {
  const id = projectId();
  if (started || !id) return;
  Clarity.init(id);
  // Re-sent every load so Clarity's own consent record never lapses. Ad storage stays
  // denied: it only drives Microsoft's ad cookie sync, which this app has no use for.
  Clarity.consentV2({ ad_Storage: "denied", analytics_Storage: "granted" });
  started = true;
  Clarity.setTag("app_version", __APP_VERSION__);
  // Installed PWA vs browser tab.
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  Clarity.setTag("display_mode", standalone ? "standalone" : "browser");
  window.addEventListener("appinstalled", onInstalled);
}

function stop(): void {
  if (!started) return;
  started = false;
  window.removeEventListener("appinstalled", onInstalled);
  // Denied consent clears Clarity's cookies but keeps recording cookieless, so also stop
  // it. "stop" isn't in the npm wrapper or the docs, hence the raw call and the guard.
  Clarity.consentV2({ ad_Storage: "denied", analytics_Storage: "denied" });
  try {
    (window as { clarity?: (command: string) => void }).clarity?.("stop");
  } catch {
    // Older script without "stop": cookies are already cleared, and nothing loads next visit.
  }
}
