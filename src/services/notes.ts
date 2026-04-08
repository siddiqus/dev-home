import { Note, NoteType } from "../types";
import { apiClient } from "./config";

export async function fetchNotes(resolved?: boolean): Promise<Note[]> {
  const params: Record<string, string> = {};
  if (resolved !== undefined) {
    params.resolved = String(resolved);
  }
  const { data } = await apiClient.get("/notes", { params });
  return data.notes;
}

export async function createNote(note: {
  type: NoteType;
  content: string;
  reference_id?: string;
}): Promise<Note> {
  const { data } = await apiClient.post("/notes", note);
  return data.note;
}

export async function updateNote(
  id: number,
  updates: { resolved?: boolean; content?: string; reference_id?: string },
): Promise<Note> {
  const { data } = await apiClient.patch(`/notes/${id}`, updates);
  return data.note;
}

export async function deleteNote(id: number): Promise<void> {
  await apiClient.delete(`/notes/${id}`);
}
