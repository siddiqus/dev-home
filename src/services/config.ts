import axios from "axios";

export interface AppSettings {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
}

declare global {
  interface Window {
    electronAPI?: {
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<void>;
      isConfigured: () => Promise<boolean>;
    };
  }
}

const API_PORT = import.meta.env.VITE_API_PORT || "3001";
export const API_BASE = `http://localhost:${API_PORT}/api`;

export const apiClient = axios.create({
  baseURL: API_BASE,
});

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
}> {
  const { data } = await apiClient.get("/config");
  return {
    configured: data.configured,
    jiraBaseUrl: data.jiraBaseUrl,
    githubUsername: data.githubUsername,
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

export async function isStoreConfigured(): Promise<boolean> {
  if (!window.electronAPI) {
    return false;
  }
  try {
    return await window.electronAPI.isConfigured();
  } catch {
    return false;
  }
}
