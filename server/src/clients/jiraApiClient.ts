import axios from "axios";
import { getConfig } from "../config";

/**
 * Creates an Axios instance pre-configured for the JIRA REST API.
 *
 * Because the base URL and credentials come from runtime config (which can
 * change after startup via the settings UI), we build a fresh instance on
 * every call rather than caching a singleton.
 */
export function createJiraClient() {
  const config = getConfig();
  const credentials = Buffer.from(`${config.jiraEmail}:${config.jiraApiToken}`).toString("base64");

  return axios.create({
    baseURL: `${config.jiraBaseUrl}/rest/api/3`,
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
}
