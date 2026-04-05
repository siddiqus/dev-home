import { useState, useEffect, useCallback } from "react";
import {
  checkBackendHealth,
  fetchBackendConfig,
  loadSettingsFromStore,
  saveSettingsToStore,
  saveSettingsToBackend,
  AppSettings,
} from "../services/config";

interface UseConfigReturn {
  configured: boolean;
  loading: boolean;
  backendOnline: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
  saveSettings: (settings: AppSettings) => Promise<void>;
  refreshConfig: () => void;
}

export function useConfig(): UseConfigReturn {
  const [configured, setConfigured] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string>("");
  const [githubUsername, setGithubUsername] = useState<string>("");

  const init = useCallback(async () => {
    try {
      setLoading(true);

      // First try to load settings from electron-store
      const storedSettings = await loadSettingsFromStore();
      if (
        storedSettings &&
        storedSettings.jiraBaseUrl &&
        storedSettings.jiraEmail &&
        storedSettings.jiraApiToken &&
        storedSettings.githubToken &&
        storedSettings.githubUsername
      ) {
        // All fields are non-empty, POST them to the backend
        try {
          await saveSettingsToBackend(storedSettings);
        } catch (err) {
          console.error("Failed to sync stored settings to backend:", err);
        }
      }

      // Check backend health and fetch config
      const healthy = await checkBackendHealth();
      setBackendOnline(healthy);

      if (healthy) {
        const config = await fetchBackendConfig();
        setConfigured(config.configured);
        setJiraBaseUrl(config.jiraBaseUrl);
        setGithubUsername(config.githubUsername);
      }
    } catch (err) {
      console.error("Failed to initialize config:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  const refreshConfig = useCallback(() => {
    init();
  }, [init]);

  const saveSettings = useCallback(
    async (settings: AppSettings): Promise<void> => {
      await saveSettingsToStore(settings);
      await saveSettingsToBackend(settings);
      await init();
    },
    [init],
  );

  return {
    configured,
    loading,
    backendOnline,
    jiraBaseUrl,
    githubUsername,
    saveSettings,
    refreshConfig,
  };
}
