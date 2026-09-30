import { Note, NoteType } from "../types";
import { createCollection, sqliteNow } from "../lib/localStore";

export const notesCollection = createCollection<Note>("notes");

const VALID_TYPES: NoteType[] = ["free_text", "jira_ticket", "github_pr", "link"];

/**
 * Accepts null/undefined (no reminder) or a non-empty string that parses to a
 * date. Past dates are valid (overdue reminders are allowed).
 */
export function isValidRemindAt(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string" || value === "") return false;
  return !Number.isNaN(new Date(value).getTime());
}

export async function fetchNotes(resolved?: boolean): Promise<Note[]> {
  let notes = notesCollection.all();
  if (resolved !== undefined) {
    notes = notes.filter((n) => n.resolved === (resolved ? 1 : 0));
  }
  return [...notes].sort(
    (a, b) => b.pinned - a.pinned || b.created_at.localeCompare(a.created_at) || b.id - a.id,
  );
}

export async function createNote(note: {
  type: NoteType;
  title?: string;
  content: string;
  reference_id?: string;
  remind_at?: string | null;
}): Promise<Note> {
  const { type, title, content, reference_id, remind_at } = note;
  if (!type || !VALID_TYPES.includes(type)) {
    throw new Error(`type must be one of: ${VALID_TYPES.join(", ")}`);
  }
  if (type !== "free_text" && !reference_id) {
    throw new Error(`reference_id is required for type '${type}'`);
  }
  if (remind_at !== undefined && !isValidRemindAt(remind_at)) {
    throw new Error("remind_at must be a valid date or null");
  }
  const now = sqliteNow();
  return notesCollection.insert({
    type,
    title: title || "",
    content: content || "",
    reference_id: reference_id || null,
    resolved: 0,
    pinned: 0,
    remind_at: remind_at ?? null,
    created_at: now,
    updated_at: now,
  });
}

export async function updateNote(
  id: number,
  updates: {
    resolved?: boolean;
    pinned?: boolean;
    title?: string;
    content?: string;
    reference_id?: string;
    remind_at?: string | null;
  },
): Promise<Note> {
  if (!notesCollection.get(id)) throw new Error("Note not found");
  if (updates.remind_at !== undefined && !isValidRemindAt(updates.remind_at)) {
    throw new Error("remind_at must be a valid date or null");
  }
  const patch: Partial<Omit<Note, "id">> = { updated_at: sqliteNow() };
  if (updates.resolved !== undefined) patch.resolved = updates.resolved ? 1 : 0;
  if (updates.pinned !== undefined) patch.pinned = updates.pinned ? 1 : 0;
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.content !== undefined) patch.content = updates.content;
  if (updates.reference_id !== undefined) patch.reference_id = updates.reference_id;
  if (updates.remind_at !== undefined) patch.remind_at = updates.remind_at;
  return notesCollection.update(id, patch)!;
}

export async function deleteNote(id: number): Promise<void> {
  if (!notesCollection.remove(id)) throw new Error("Note not found");
}
