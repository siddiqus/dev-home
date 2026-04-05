export interface ServerConfig {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
  port: number;
}

const REQUIRED_ENV_VARS = [
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
  'GITHUB_TOKEN',
  'GITHUB_USERNAME',
] as const;

export function getConfig(): ServerConfig {
  const missing: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Please copy .env.example to .env and fill in the values.'
    );
  }

  return {
    jiraBaseUrl: process.env.JIRA_BASE_URL!.replace(/\/$/, ''),
    jiraEmail: process.env.JIRA_EMAIL!,
    jiraApiToken: process.env.JIRA_API_TOKEN!,
    githubToken: process.env.GITHUB_TOKEN!,
    githubUsername: process.env.GITHUB_USERNAME!,
    port: parseInt(process.env.VITE_API_PORT || '3001', 10),
  };
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
