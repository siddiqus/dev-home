import { JiraIssue, JiraComment } from "../types";
import { getIssues, postIssuesBulk, getJiraMentions } from "../api/jira";

export async function fetchAssignedIssues(): Promise<JiraIssue[]> {
  const { issues } = await getIssues();
  return issues;
}

export async function fetchIssuesByKeys(keys: string[]): Promise<JiraIssue[]> {
  if (keys.length === 0) return [];
  const { issues } = await postIssuesBulk({ keys });
  return issues;
}

export async function fetchRecentMentions(): Promise<JiraComment[]> {
  const { comments } = await getJiraMentions();
  return comments;
}
