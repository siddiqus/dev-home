import { useState, useEffect } from "react";
import { checkBackendHealth, fetchBackendConfig } from "../services/config";

interface UseConfigReturn {
  configured: boolean;
  loading: boolean;
  backendOnline: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
}

export function useConfig(): UseConfigReturn {
  const [configured, setConfigured] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string>("");
  const [githubUsername, setGithubUsername] = useState<string>("");

  useEffect(() => {
    async function init() {
      try {
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
    }

    init();
  }, []);

  return { configured, loading, backendOnline, jiraBaseUrl, githubUsername };
}
