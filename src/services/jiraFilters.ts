import { JiraIssue } from "../types";
import { createCollection, sqliteNow } from "../lib/localStore";
import { getRemoteFilters, postJqlSearch } from "../api/jira";

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

export const jqlFiltersCollection = createCollection<JqlFilter>("jira_jql_filters");

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

export async function fetchLocalJqlFilters(): Promise<JqlFilter[]> {
  return [...jqlFiltersCollection.all()].sort(
    (a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id,
  );
}

export async function createLocalJqlFilter(name: string, jql: string): Promise<JqlFilter> {
  const now = sqliteNow();
  return jqlFiltersCollection.insert({
    name: requireText(name, "name"),
    jql: requireText(jql, "jql"),
    created_at: now,
    updated_at: now,
  });
}

export async function updateLocalJqlFilter(
  id: number,
  updates: { name?: string; jql?: string },
): Promise<JqlFilter> {
  if (!jqlFiltersCollection.get(id)) throw new Error("Filter not found");
  const patch: Partial<Omit<JqlFilter, "id">> = { updated_at: sqliteNow() };
  if (updates.name !== undefined) patch.name = requireText(updates.name, "name");
  if (updates.jql !== undefined) patch.jql = requireText(updates.jql, "jql");
  return jqlFiltersCollection.update(id, patch)!;
}

export async function deleteLocalJqlFilter(id: number): Promise<void> {
  if (!jqlFiltersCollection.remove(id)) throw new Error("Filter not found");
}

export async function fetchRemoteJiraFilters(): Promise<RemoteJiraFilter[]> {
  const { filters } = await getRemoteFilters();
  return filters;
}

export async function searchJql(
  jql: string,
  nextPageToken?: string | null,
): Promise<{ issues: JiraIssue[]; nextPageToken: string | null }> {
  const result = await postJqlSearch({ jql, nextPageToken: nextPageToken ?? null });
  return { issues: result.issues, nextPageToken: result.nextPageToken };
}
