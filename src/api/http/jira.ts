import axios, { type AxiosInstance } from "axios";
import { base64Utf8, requireSettings } from "./credentials";
import { toApiError } from "./errors";

/** Where the Jira passthrough proxy lives. Same origin by default. */
export const JIRA_PROXY_BASE: string =
  (import.meta.env?.VITE_JIRA_PROXY_URL as string | undefined)?.replace(/\/+$/, "") ||
  "/jira-proxy";

function createJiraClient(apiPath: string): AxiosInstance {
  const s = requireSettings();
  const client = axios.create({
    baseURL: `${JIRA_PROXY_BASE}${apiPath}`,
    headers: {
      "x-jira-base-url": s.jiraBaseUrl.replace(/\/+$/, ""),
      Authorization: `Basic ${base64Utf8(`${s.jiraEmail}:${s.jiraApiToken}`)}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  client.interceptors.response.use(undefined, (err) => Promise.reject(toApiError(err)));
  return client;
}

/** Jira platform REST API v3, via the proxy. */
export const jiraClient = () => createJiraClient("/rest/api/3");
/** Jira platform REST API v2 (only used for email user search). */
export const jiraClientV2 = () => createJiraClient("/rest/api/2");
/** Jira Software (Agile) REST API, via the proxy. */
export const jiraAgileClient = () => createJiraClient("/rest/agile/1.0");
