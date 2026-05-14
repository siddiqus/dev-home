export interface ServerConfig {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
  githubOrg: string;
  port: number;
}

const REQUIRED_ENV_VARS = [
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "GITHUB_TOKEN",
  "GITHUB_USERNAME",
] as const;

let runtimeConfig: ServerConfig | null = null;

/**
 * Store runtime configuration provided by the frontend.
 * The port is automatically derived from the environment or defaults to 3571.
 */
export function setRuntimeConfig(config: Omit<ServerConfig, "port">): void {
  runtimeConfig = {
    ...config,
    port: parseInt(process.env.VITE_API_PORT || "3571", 10),
  };
}

/**
 * Returns the current server configuration.
 * If runtime config has been set via setRuntimeConfig(), it takes precedence.
 * Otherwise falls back to environment variables.
 */
export function getConfig(): ServerConfig {
  if (runtimeConfig) {
    return runtimeConfig;
  }

  const missing = validateEnv();
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Please copy .env.example to .env and fill in the values.",
    );
  }

  return {
    jiraBaseUrl: process.env.JIRA_BASE_URL!.replace(/\/$/, ""),
    jiraEmail: process.env.JIRA_EMAIL!,
    jiraApiToken: process.env.JIRA_API_TOKEN!,
    githubToken: process.env.GITHUB_TOKEN!,
    githubUsername: process.env.GITHUB_USERNAME!,
    githubOrg: process.env.GITHUB_ORG || "",
    port: parseInt(process.env.VITE_API_PORT || "3571", 10),
  };
}

/**
 * Returns true if the server is configured, either via runtime config
 * or via environment variables.
 */
export function isConfigured(): boolean {
  if (runtimeConfig) {
    return true;
  }

  return REQUIRED_ENV_VARS.every((varName) => !!process.env[varName]);
}

/**
 * Validate that all required env vars are present.
 * Returns an array of missing variable names (empty if all are set).
 */
export function validateEnv(): string[] {
  const missing: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  return missing;
}
