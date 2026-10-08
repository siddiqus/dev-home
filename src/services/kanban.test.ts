import { beforeEach, describe, expect, it } from "vitest";
import { batchUpdateKanbanItems, fetchKanbanItems, upsertKanbanItem } from "./kanban";

describe("kanban service (localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("upserts by (item_type, item_id)", async () => {
    const a = await upsertKanbanItem({
      item_type: "pr",
      item_id: "o/r#1",
      column_name: "todo",
      position: 0,
    });
    const b = await upsertKanbanItem({
      item_type: "pr",
      item_id: "o/r#1",
      column_name: "done",
      position: 3,
    });
    expect(b.id).toBe(a.id);
    expect(await fetchKanbanItems()).toHaveLength(1);
    expect((await fetchKanbanItems())[0]).toMatchObject({ column_name: "done", position: 3 });
  });

  it("validates item_type, item_id and column", async () => {
    await expect(
      upsertKanbanItem({ item_type: "x", item_id: "1", column_name: "todo", position: 0 }),
    ).rejects.toThrow(/item_type/);
    await expect(
      upsertKanbanItem({ item_type: "pr", item_id: "", column_name: "todo", position: 0 }),
    ).rejects.toThrow(/item_id/);
    await expect(
      upsertKanbanItem({ item_type: "pr", item_id: "1", column_name: "nope", position: 0 }),
    ).rejects.toThrow(/column_name/);
  });

  it("sorts by column then position; batch updates existing rows only", async () => {
    await upsertKanbanItem({ item_type: "note", item_id: "1", column_name: "todo", position: 1 });
    await upsertKanbanItem({ item_type: "note", item_id: "2", column_name: "todo", position: 0 });
    await upsertKanbanItem({ item_type: "note", item_id: "3", column_name: "done", position: 0 });
    const items = await batchUpdateKanbanItems([
      { item_type: "note", item_id: "1", column_name: "done", position: 1 },
      { item_type: "note", item_id: "999", column_name: "done", position: 0 },
    ]);
    expect(items.map((i) => `${i.column_name}:${i.item_id}`)).toEqual([
      "done:3",
      "done:1",
      "todo:2",
    ]);
  });
});
