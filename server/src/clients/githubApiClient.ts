import axios from "axios";
import { getConfig } from "../config";

const GITHUB_API = "https://api.github.com";

/**
 * Creates an Axios instance pre-configured for the GitHub REST API.
 *
 * A fresh instance is built on every call so it always picks up the
 * latest token from runtime config.
 */
export function createGitHubClient(baseUrl: string = GITHUB_API) {
  const config = getConfig();
  return axios.create({
    baseURL: baseUrl,
    headers: {
      Authorization: `Bearer ${config.githubToken}`,
      Accept: "application/vnd.github+json",
    },
  });
}
