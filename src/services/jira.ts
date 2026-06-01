import { JiraIssue, JiraComment } from "../types";
import { apiClient } from "./config";

export async function fetchAssignedIssues(): Promise<JiraIssue[]> {
  const { data } = await apiClient.get("/jira/issues");
  return data.issues;
}

export async function fetchIssuesByKeys(keys: string[]): Promise<JiraIssue[]> {
  if (keys.length === 0) return [];
  const { data } = await apiClient.post("/jira/issues/bulk", { keys });
  return data.issues;
}

export async function fetchRecentMentions(): Promise<JiraComment[]> {
  const { data } = await apiClient.get("/jira/mentions");
  return data.comments;
}
