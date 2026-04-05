const API_PORT = import.meta.env.VITE_API_PORT || "3001";
export const API_BASE = `http://localhost:${API_PORT}/api`;

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) return false;
    const data = await response.json();
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
  const response = await fetch(`${API_BASE}/config`);
  if (!response.ok) {
    throw new Error(`Failed to fetch backend config (${response.status})`);
  }
  const data = await response.json();
  return {
    configured: data.configured,
    jiraBaseUrl: data.jiraBaseUrl,
    githubUsername: data.githubUsername,
  };
}
