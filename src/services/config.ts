import axios from "axios";

export interface AppSettings {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
  githubOrg: string;
}

declare global {
  interface Window {
    electronAPI?: {
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<void>;
      isConfigured: () => Promise<boolean>;
      getApiPort: () => Promise<number>;
      findInPage: (text: string, forward: boolean, findNext: boolean) => Promise<void>;
      stopFindInPage: () => Promise<void>;
      onToggleFind: (callback: () => void) => () => void;
      onFindResult: (
        callback: (result: { activeMatchOrdinal: number; matches: number }) => void,
      ) => () => void;
    };
  }
}

const DEFAULT_PORT = import.meta.env.VITE_API_PORT || "3571";

export const apiClient = axios.create({
  baseURL: `http://localhost:${DEFAULT_PORT}/api`,
});

export let API_BASE = `http://localhost:${DEFAULT_PORT}/api`;

export async function initApiPort(): Promise<void> {
  if (!window.electronAPI) {
    return;
  }
  try {
    const port = await window.electronAPI.getApiPort();
    API_BASE = `http://localhost:${port}/api`;
    apiClient.defaults.baseURL = API_BASE;
  } catch {
    // Fall back to default port
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const { data } = await apiClient.get("/health");
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function fetchBackendConfig(): Promise<{
  configured: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
  githubOrg: string;
}> {
  const { data } = await apiClient.get("/config");
  return {
    configured: data.configured,
    jiraBaseUrl: data.jiraBaseUrl,
    githubUsername: data.githubUsername,
    githubOrg: data.githubOrg || "",
  };
}

export async function saveSettingsToBackend(settings: AppSettings): Promise<void> {
  await apiClient.post("/config", settings);
}

export async function loadSettingsFromStore(): Promise<AppSettings | null> {
  if (!window.electronAPI) {
    return null;
  }
  try {
    return await window.electronAPI.getSettings();
  } catch {
    return null;
  }
}

export async function saveSettingsToStore(settings: AppSettings): Promise<void> {
  if (!window.electronAPI) {
    return;
  }
  await window.electronAPI.saveSettings(settings);
}
