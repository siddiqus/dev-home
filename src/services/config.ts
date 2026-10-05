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
  return [accountIdentity(s), s.jiraApiToken, s.githubToken].join("|");
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
