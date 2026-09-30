import axios from "axios";

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

/** Credentials travel with each request; the server keeps nothing. */
export function credentialHeaders(s: AppSettings): Record<string, string> {
  const headers: Record<string, string> = {
    "x-jira-base-url": s.jiraBaseUrl.replace(/\/+$/, ""),
    "x-jira-email": s.jiraEmail,
    "x-jira-api-token": s.jiraApiToken,
    "x-github-token": s.githubToken,
    "x-github-username": s.githubUsername,
  };
  if (s.githubOrg) headers["x-github-org"] = s.githubOrg;
  return headers;
}

export const API_BASE = "/api";

export const apiClient = axios.create({ baseURL: API_BASE });

apiClient.interceptors.request.use((cfg) => {
  cfg.headers.set(credentialHeaders(loadSettings()));
  return cfg;
});

export async function checkBackendHealth(): Promise<{ online: boolean; version: string }> {
  try {
    const { data } = await apiClient.get("/health");
    return { online: data.status === "ok", version: data.version || "" };
  } catch {
    return { online: false, version: "" };
  }
}
