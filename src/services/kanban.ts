import { KanbanItem } from "../types";
import { apiClient } from "./config";

export async function fetchKanbanItems(): Promise<KanbanItem[]> {
  const { data } = await apiClient.get("/kanban");
  return data.items;
}

export async function upsertKanbanItem(item: {
  item_type: string;
  item_id: string;
  column_name: string;
  position: number;
}): Promise<KanbanItem> {
  const { data } = await apiClient.post("/kanban", item);
  return data.item;
}

export async function batchUpdateKanbanItems(
  items: {
    item_type: string;
    item_id: string;
    column_name: string;
    position: number;
  }[],
): Promise<KanbanItem[]> {
  const { data } = await apiClient.put("/kanban/batch", { items });
  return data.items;
}

export async function deleteKanbanItem(itemType: string, itemId: string): Promise<void> {
  await apiClient.delete(`/kanban/${itemType}/${encodeURIComponent(itemId)}`);
}
