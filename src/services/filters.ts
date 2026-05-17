import { apiClient } from "./config";

export interface SavedFilterData {
  id: number;
  name: string;
  filter_config: { authors: string[]; repos: string[] };
  created_at: string;
  updated_at: string;
}

export async function fetchSavedFilters(): Promise<SavedFilterData[]> {
  const { data } = await apiClient.get("/filters");
  return data.filters;
}

export async function createSavedFilter(
  name: string,
  filter_config: { authors: string[]; repos: string[] },
): Promise<SavedFilterData> {
  const { data } = await apiClient.post("/filters", { name, filter_config });
  return data.filter;
}

export async function deleteSavedFilter(id: number): Promise<void> {
  await apiClient.delete(`/filters/${id}`);
}
