import { useState, useEffect, useCallback } from "react";
import { Note, NoteType } from "../types";
import { fetchNotes, createNote, updateNote, deleteNote } from "../services/notes";

export function useNotes(active: boolean) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotes();
      setNotes(data);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const unresolvedNotes = notes.filter((n) => n.resolved === 0);

  const addNote = useCallback(
    async (type: NoteType, content: string, referenceId?: string, title?: string) => {
      try {
        const newNote = await createNote({ type, title, content, reference_id: referenceId });
        setNotes((prev) => [newNote, ...prev]);
      } catch (err: any) {
        setError(err?.message || "Failed to add note");
        throw err;
      }
    },
    [],
  );

  const resolveNote = useCallback(async (id: number) => {
    try {
      const updated = await updateNote(id, { resolved: true });
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    } catch (err: any) {
      setError(err?.message || "Failed to resolve note");
      throw err;
    }
  }, []);

  const unresolveNote = useCallback(async (id: number) => {
    try {
      const updated = await updateNote(id, { resolved: false });
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    } catch (err: any) {
      setError(err?.message || "Failed to unresolve note");
      throw err;
    }
  }, []);

  const editNote = useCallback(
    async (id: number, updates: { title?: string; content?: string; reference_id?: string }) => {
      try {
        const updated = await updateNote(id, updates);
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      } catch (err: any) {
        setError(err?.message || "Failed to edit note");
        throw err;
      }
    },
    [],
  );

  const removeNote = useCallback(async (id: number) => {
    try {
      await deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err: any) {
      setError(err?.message || "Failed to delete note");
      throw err;
    }
  }, []);

  return {
    notes,
    unresolvedNotes,
    loading,
    error,
    addNote,
    editNote,
    resolveNote,
    unresolveNote,
    removeNote,
    refresh: loadNotes,
  };
}
