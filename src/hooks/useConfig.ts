import { useState, useEffect, useCallback } from "react";
import {
  checkBackendHealth,
  isConfigured,
  loadSettings,
  saveSettings as persistSettings,
  SETTINGS_EVENT,
  AppSettings,
} from "../services/config";

interface UseConfigReturn {
  configured: boolean;
  loading: boolean;
  backendOnline: boolean;
  backendVersion: string;
  jiraBaseUrl: string;
  githubUsername: string;
  githubOrg: string;
  saveSettings: (settings: AppSettings) => Promise<void>;
  refreshConfig: () => void;
}

export function useConfig(): UseConfigReturn {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [loading, setLoading] = useState<boolean>(true);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [backendVersion, setBackendVersion] = useState<string>("");

  const init = useCallback(async () => {
    setLoading(true);
    setSettings(loadSettings());
    const health = await checkBackendHealth();
    setBackendOnline(health.online);
    setBackendVersion(health.version);
    setLoading(false);
  }, []);

  useEffect(() => {
    init();
    const onChange = () => setSettings(loadSettings());
    window.addEventListener(SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(SETTINGS_EVENT, onChange);
  }, [init]);

  const saveSettings = useCallback(async (next: AppSettings) => {
    persistSettings(next);
    setSettings(next);
  }, []);

  return {
    configured: isConfigured(settings),
    loading,
    backendOnline,
    backendVersion,
    jiraBaseUrl: settings.jiraBaseUrl.replace(/\/+$/, ""),
    githubUsername: settings.githubUsername,
    githubOrg: settings.githubOrg,
    saveSettings,
    refreshConfig: init,
  };
}
