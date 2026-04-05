import { JiraIssue, JiraComment } from '../types';
import { API_BASE } from './config';

export async function fetchAssignedIssues(): Promise<JiraIssue[]> {
  const response = await fetch(`${API_BASE}/jira/issues`);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to fetch assigned JIRA issues (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  return data.issues;
}

export async function fetchRecentMentions(): Promise<JiraComment[]> {
  const response = await fetch(`${API_BASE}/jira/mentions`);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to fetch JIRA mentions (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  return data.comments;
}
