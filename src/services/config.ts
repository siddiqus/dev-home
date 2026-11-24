import { JIRA_PROXY_BASE } from "../api/http/jira";

export interface AppSettings {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
  githubOrg: string;
  /** Sidebar tab keys the user has hidden. Summary is never included. */
  hiddenTabs: string[];
  /** Days off, as JS getDay() values (0 = Sun). Absent → DEFAULT_WEEKEND_DAYS. */
  weekendDays?: number[];
  /** Mentions: drop notifications for team @-mentions, keeping only ones addressed to the user. */
  mentionsDirectOnly?: boolean;
}

export const SETTINGS_KEY = "dev-home-settings";
export const SETTINGS_EVENT = "dev-home-settings";

const DEFAULT_SETTINGS: AppSettings = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  githubToken: "",
  githubUsername: "",
  githubOrg: "",
  hiddenTabs: [],
};

/** Friday + Saturday. */
export const DEFAULT_WEEKEND_DAYS: number[] = [5, 6];

/** The configured weekend, falling back to the default and dropping invalid days. */
export function getWeekendDays(s: Pick<AppSettings, "weekendDays">): number[] {
  if (!Array.isArray(s.weekendDays)) return [...DEFAULT_WEEKEND_DAYS];
  return s.weekendDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

export function loadSettings(): AppSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    if (!Array.isArray(settings.hiddenTabs)) {
      settings.hiddenTabs = [];
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

export function isConfigured(s: AppSettings): boolean {
  return !!(s.jiraBaseUrl && s.jiraEmail && s.jiraApiToken && s.githubToken && s.githubUsername);
}

/**
 * Identity of the accounts the dashboard reads (no secrets), used to discard
 * cached data written for a different user or Jira site.
 */
export function accountIdentity(s: AppSettings): string {
  return [s.githubUsername, s.jiraBaseUrl, s.jiraEmail].join("|");
}

/** Every setting that changes what remote calls return (UI prefs excluded). */
export function credentialsFingerprint(s: AppSettings): string {
  return [
    accountIdentity(s),
    s.jiraApiToken,
    s.githubToken,
    s.mentionsDirectOnly ? "direct" : "",
  ].join("|");
}

/** Checks the Jira passthrough proxy; the version is the app build's own. */
export async function checkBackendHealth(): Promise<{ online: boolean; version: string }> {
  try {
    const res = await fetch(`${JIRA_PROXY_BASE}/health`);
    const body = await res.json();
    return { online: res.ok && body?.status === "ok", version: __APP_VERSION__ };
  } catch {
    return { online: false, version: __APP_VERSION__ };
  }
}
