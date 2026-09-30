import { AsyncLocalStorage } from "node:async_hooks";

export interface ServerConfig {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
  githubOrg: string;
}

/** Credentials arrive on every request from the browser; nothing is stored server-side. */
export const CONFIG_HEADERS: Record<keyof ServerConfig, string> = {
  jiraBaseUrl: "x-jira-base-url",
  jiraEmail: "x-jira-email",
  jiraApiToken: "x-jira-api-token",
  githubToken: "x-github-token",
  githubUsername: "x-github-username",
  githubOrg: "x-github-org",
};

const REQUIRED: (keyof ServerConfig)[] = [
  "jiraBaseUrl",
  "jiraEmail",
  "jiraApiToken",
  "githubToken",
  "githubUsername",
];

export class MissingConfigError extends Error {
  status = 401;
  constructor() {
    super("Missing credentials: configure Dev Home in Settings");
  }
}

const requestConfig = new AsyncLocalStorage<ServerConfig | null>();

function isJiraBaseUrlAllowed(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase();
    if (hostname.endsWith(".atlassian.net")) {
      return url.origin + url.pathname.replace(/\/+$/, "");
    }

    const allowedHosts = (process.env.JIRA_ALLOWED_HOSTS || "")
      .split(",")
      .map((h: string) => h.trim().toLowerCase())
      .filter(Boolean);
    if (allowedHosts.includes(hostname)) {
      return url.origin + url.pathname.replace(/\/+$/, "");
    }

    return null;
  } catch {
    return null;
  }
}

export function configFromHeaders(
  get: (name: string) => string | null | undefined,
): ServerConfig | null {
  const read = (k: keyof ServerConfig) => (get(CONFIG_HEADERS[k]) ?? "").trim();
  if (REQUIRED.some((k) => !read(k))) return null;

  const jiraBaseUrl = isJiraBaseUrlAllowed(read("jiraBaseUrl"));
  if (!jiraBaseUrl) return null;

  return {
    jiraBaseUrl,
    jiraEmail: read("jiraEmail"),
    jiraApiToken: read("jiraApiToken"),
    githubToken: read("githubToken"),
    githubUsername: read("githubUsername"),
    githubOrg: read("githubOrg"),
  };
}

export function runWithConfig<T>(config: ServerConfig | null, fn: () => T): T {
  return requestConfig.run(config, fn);
}

/** The calling request's credentials. Throws a 401 error if none were sent. */
export function getConfig(): ServerConfig {
  const config = requestConfig.getStore();
  if (!config) throw new MissingConfigError();
  return config;
}
