import { beforeEach, describe, expect, it } from "vitest";
import { createNote, deleteNote, fetchNotes, updateNote, isValidRemindAt } from "./notes";

describe("notes service (localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("creates notes with defaults", async () => {
    const n = await createNote({ type: "free_text", content: "hi" });
    expect(n).toMatchObject({
      id: 1,
      type: "free_text",
      title: "",
      content: "hi",
      reference_id: null,
      resolved: 0,
      pinned: 0,
      remind_at: null,
    });
    expect(n.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("validates type, reference_id and remind_at", async () => {
    await expect(createNote({ type: "bogus" as any, content: "" })).rejects.toThrow(
      /type must be one of/,
    );
    await expect(createNote({ type: "github_pr", content: "" })).rejects.toThrow(
      /reference_id is required/,
    );
    await expect(createNote({ type: "free_text", content: "", remind_at: "nope" })).rejects.toThrow(
      /remind_at/,
    );
    expect(isValidRemindAt(null)).toBe(true);
    expect(isValidRemindAt("")).toBe(false);
    expect(isValidRemindAt("2026-01-01T00:00:00Z")).toBe(true);
  });

  it("orders pinned first then newest, and filters by resolved", async () => {
    const a = await createNote({ type: "free_text", content: "a" });
    const b = await createNote({ type: "free_text", content: "b" });
    await createNote({ type: "free_text", content: "c" });
    await updateNote(a.id, { pinned: true });
    await updateNote(b.id, { resolved: true });
    expect((await fetchNotes()).map((n) => n.content)).toEqual(["a", "c", "b"]);
    expect((await fetchNotes(true)).map((n) => n.content)).toEqual(["b"]);
    expect((await fetchNotes(false)).map((n) => n.content)).toEqual(["a", "c"]);
  });

  it("updates and deletes; unknown id throws", async () => {
    const n = await createNote({ type: "free_text", content: "x" });
    const u = await updateNote(n.id, { title: "T", remind_at: null });
    expect(u.title).toBe("T");
    await deleteNote(n.id);
    expect(await fetchNotes()).toEqual([]);
    await expect(updateNote(n.id, { title: "y" })).rejects.toThrow("Note not found");
    await expect(deleteNote(n.id)).rejects.toThrow("Note not found");
  });
});
