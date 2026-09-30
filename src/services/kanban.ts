import { KanbanItem } from "../types";
import { createCollection, sqliteNow } from "../lib/localStore";

export const kanbanCollection = createCollection<KanbanItem>("kanban_items");

const VALID_ITEM_TYPES = ["note", "pr", "review"];
const VALID_COLUMNS = ["todo", "in_progress", "on_hold", "in_review", "done"];

interface KanbanInput {
  item_type: string;
  item_id: string;
  column_name: string;
  position: number;
}

function sorted(items: KanbanItem[]): KanbanItem[] {
  return [...items].sort(
    (a, b) => a.column_name.localeCompare(b.column_name) || a.position - b.position,
  );
}

function find(itemType: string, itemId: string): KanbanItem | undefined {
  return kanbanCollection.all().find((i) => i.item_type === itemType && i.item_id === itemId);
}

export async function fetchKanbanItems(): Promise<KanbanItem[]> {
  return sorted(kanbanCollection.all());
}

export async function upsertKanbanItem(item: KanbanInput): Promise<KanbanItem> {
  const { item_type, item_id, column_name, position } = item;
  if (!item_type || !VALID_ITEM_TYPES.includes(item_type)) {
    throw new Error(`item_type must be one of: ${VALID_ITEM_TYPES.join(", ")}`);
  }
  if (!item_id) throw new Error("item_id is required");
  if (!column_name || !VALID_COLUMNS.includes(column_name)) {
    throw new Error(`column_name must be one of: ${VALID_COLUMNS.join(", ")}`);
  }
  const now = sqliteNow();
  const existing = find(item_type, item_id);
  const fields = {
    column_name: column_name as KanbanItem["column_name"],
    position: position ?? 0,
    updated_at: now,
  };
  if (existing) return kanbanCollection.update(existing.id, fields)!;
  return kanbanCollection.insert({
    item_type: item_type as KanbanItem["item_type"],
    item_id,
    created_at: now,
    ...fields,
  });
}

export async function batchUpdateKanbanItems(items: KanbanInput[]): Promise<KanbanItem[]> {
  const now = sqliteNow();
  for (const entry of items) {
    const existing = find(entry.item_type, entry.item_id);
    if (existing) {
      kanbanCollection.update(existing.id, {
        column_name: entry.column_name as KanbanItem["column_name"],
        position: entry.position ?? 0,
        updated_at: now,
      });
    }
  }
  return sorted(kanbanCollection.all());
}

export async function deleteKanbanItem(itemType: string, itemId: string): Promise<void> {
  const removed = kanbanCollection.removeWhere(
    (i) => i.item_type === itemType && i.item_id === itemId,
  );
  if (removed === 0) throw new Error("Kanban item not found");
}
