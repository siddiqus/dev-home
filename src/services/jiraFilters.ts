import { JiraIssue } from "../types";
import { apiClient } from "./config";

export interface JqlFilter {
  id: number;
  name: string;
  jql: string;
  created_at: string;
  updated_at: string;
}

export interface RemoteJiraFilter {
  id: string;
  name: string;
  jql: string;
  favourite: boolean;
}

export async function fetchLocalJqlFilters(): Promise<JqlFilter[]> {
  const { data } = await apiClient.get("/jira-filters");
  return data.filters;
}

export async function createLocalJqlFilter(name: string, jql: string): Promise<JqlFilter> {
  const { data } = await apiClient.post("/jira-filters", { name, jql });
  return data.filter;
}

export async function updateLocalJqlFilter(
  id: number,
  updates: { name?: string; jql?: string },
): Promise<JqlFilter> {
  const { data } = await apiClient.put(`/jira-filters/${id}`, updates);
  return data.filter;
}

export async function deleteLocalJqlFilter(id: number): Promise<void> {
  await apiClient.delete(`/jira-filters/${id}`);
}

export async function fetchRemoteJiraFilters(): Promise<RemoteJiraFilter[]> {
  const { data } = await apiClient.get("/jira-filters/remote");
  return data.filters;
}

export async function searchJql(
  jql: string,
  nextPageToken?: string | null,
): Promise<{ issues: JiraIssue[]; total: number; nextPageToken: string | null }> {
  const payload: Record<string, any> = { jql };
  if (nextPageToken) payload.nextPageToken = nextPageToken;
  const { data } = await apiClient.post("/jira-filters/search", payload);
  return { issues: data.issues, total: data.total, nextPageToken: data.nextPageToken };
}
