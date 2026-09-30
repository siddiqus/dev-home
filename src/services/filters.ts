import { createCollection, sqliteNow } from "../lib/localStore";

export interface SavedFilterData {
  id: number;
  name: string;
  filter_config: { authors: string[]; repos: string[] };
  created_at: string;
  updated_at: string;
}

type FilterConfig = SavedFilterData["filter_config"];

export const savedFiltersCollection = createCollection<SavedFilterData>("saved_filters");

function requireName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) throw new Error("name is required");
  return name.trim();
}

function requireConfig(config: unknown): FilterConfig {
  const c = config as FilterConfig;
  if (!c || !Array.isArray(c.authors) || !Array.isArray(c.repos)) {
    throw new Error("filter_config must include authors and repos arrays");
  }
  return { authors: c.authors, repos: c.repos };
}

export async function fetchSavedFilters(): Promise<SavedFilterData[]> {
  return [...savedFiltersCollection.all()].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id,
  );
}

export async function createSavedFilter(
  name: string,
  filter_config: FilterConfig,
): Promise<SavedFilterData> {
  const now = sqliteNow();
  return savedFiltersCollection.insert({
    name: requireName(name),
    filter_config: requireConfig(filter_config),
    created_at: now,
    updated_at: now,
  });
}

export async function updateSavedFilter(
  id: number,
  data: { name?: string; filter_config?: FilterConfig },
): Promise<SavedFilterData> {
  if (!savedFiltersCollection.get(id)) throw new Error("Filter not found");
  const patch: Partial<Omit<SavedFilterData, "id">> = { updated_at: sqliteNow() };
  if (data.name !== undefined) patch.name = requireName(data.name);
  if (data.filter_config !== undefined) patch.filter_config = requireConfig(data.filter_config);
  return savedFiltersCollection.update(id, patch)!;
}

export async function deleteSavedFilter(id: number): Promise<void> {
  if (!savedFiltersCollection.remove(id)) throw new Error("Filter not found");
}
