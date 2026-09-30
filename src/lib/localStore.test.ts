import { beforeEach, describe, expect, it } from "vitest";
import { createCollection, readJson, writeJson, sqliteNow, DB_PREFIX } from "./localStore";

interface Row {
  id: number;
  name: string;
}

describe("localStore", () => {
  beforeEach(() => localStorage.clear());

  it("formats timestamps like SQLite datetime('now')", () => {
    expect(sqliteNow(new Date("2026-09-30T07:05:09.123Z"))).toBe("2026-09-30 07:05:09");
  });

  it("readJson returns fallback for missing or corrupt values", () => {
    expect(readJson("x", 1)).toBe(1);
    localStorage.setItem(DB_PREFIX + "x", "{not json");
    expect(readJson("x", 2)).toBe(2);
    writeJson("x", { a: 1 });
    expect(readJson("x", null)).toEqual({ a: 1 });
  });

  it("inserts with auto-increment ids that are never reused", () => {
    const c = createCollection<Row>("rows");
    expect(c.insert({ name: "a" })).toEqual({ id: 1, name: "a" });
    expect(c.insert({ name: "b" }).id).toBe(2);
    c.remove(2);
    expect(c.insert({ name: "c" }).id).toBe(3);
    expect(c.all().map((r) => r.name)).toEqual(["a", "c"]);
  });

  it("updates, gets and removes", () => {
    const c = createCollection<Row>("rows");
    const a = c.insert({ name: "a" });
    expect(c.update(a.id, { name: "z" })).toEqual({ id: 1, name: "z" });
    expect(c.get(1)?.name).toBe("z");
    expect(c.update(99, { name: "q" })).toBeUndefined();
    expect(c.remove(99)).toBe(false);
    expect(c.remove(1)).toBe(true);
    expect(c.all()).toEqual([]);
  });

  it("removeWhere and replaceAll keep nextId ahead of existing ids", () => {
    const c = createCollection<Row>("rows");
    c.insert({ name: "a" });
    c.insert({ name: "b" });
    expect(c.removeWhere((r) => r.name === "a")).toBe(1);
    c.replaceAll([{ id: 40, name: "imported" }]);
    expect(c.insert({ name: "next" }).id).toBe(41);
  });

  it("persists across collection instances", () => {
    createCollection<Row>("rows").insert({ name: "a" });
    expect(createCollection<Row>("rows").all()).toEqual([{ id: 1, name: "a" }]);
  });

  it("falls back to empty collection when stored data is malformed", () => {
    localStorage.setItem(DB_PREFIX + "rows", JSON.stringify({ nextId: "not-a-number", rows: [] }));
    const c1 = createCollection<Row>("rows");
    expect(c1.all()).toEqual([]);
    expect(c1.insert({ name: "a" }).id).toBe(1);

    localStorage.setItem(DB_PREFIX + "rows2", JSON.stringify({ nextId: 1, rows: "not-an-array" }));
    const c2 = createCollection<Row>("rows2");
    expect(c2.all()).toEqual([]);
    expect(c2.insert({ name: "b" }).id).toBe(1);
  });
});
