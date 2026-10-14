import { useEffect, useRef, useState } from "react";
import type { Note, NoteType } from "../../types";
import { standupRef, standupTitle } from "./dates";

const SAVE_DEBOUNCE_MS = 600;

export interface StandupNoteOptions {
  now: Date;
  notes: Note[];
  /** False until Notes have loaded; creating before then could duplicate today's note. */
  notesLoaded: boolean;
  addNote: (type: NoteType, content: string, referenceId?: string, title?: string) => Promise<Note>;
  editNote: (id: number, updates: { content?: string; title?: string }) => Promise<void>;
  /** Called on every keystroke so the copy preview stays live. */
  onChange: (content: string) => void;
}

/**
 * Today's standup note, autosaved (debounced) into Notes. The first save
 * creates the note; keystrokes during that create are folded into one
 * follow-up edit so we never create two notes for the same day. Callers key
 * the component using it on standupRef(now), so it remounts per day.
 */
export function useStandupNote({
  now,
  notes,
  notesLoaded,
  addNote,
  editNote,
  onChange,
}: StandupNoteOptions) {
  const referenceId = standupRef(now);
  const title = standupTitle(now);
  const note = notes.find((n) => n.type === "standup" && n.reference_id === referenceId);

  const [text, setText] = useState(note?.content ?? "");
  const [saveError, setSaveError] = useState(false);
  const typedRef = useRef(false);
  const latestRef = useRef(text);
  const noteIdRef = useRef<number | null>(note?.id ?? null);
  const creatingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A create was held back because Notes hadn't loaded yet. */
  const deferredRef = useRef(false);
  const notesLoadedRef = useRef(notesLoaded);
  // Refs so the debounced save always sees the latest callbacks and context.
  const addNoteRef = useRef(addNote);
  const editNoteRef = useRef(editNote);
  const referenceIdRef = useRef(referenceId);
  const titleRef = useRef(title);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    addNoteRef.current = addNote;
    editNoteRef.current = editNote;
    referenceIdRef.current = referenceId;
    titleRef.current = title;
    onChangeRef.current = onChange;
    notesLoadedRef.current = notesLoaded;
  });

  // Remounts per day (keyed by the parent): seed the preview with this day's text.
  useEffect(() => {
    onChangeRef.current(latestRef.current);
  }, []);

  // Notes load after mount: adopt the saved note once, unless the user already typed.
  useEffect(() => {
    if (!note) return;
    if (noteIdRef.current === null) noteIdRef.current = note.id;
    if (!typedRef.current && latestRef.current !== note.content) {
      latestRef.current = note.content;
      setText(note.content);
      onChangeRef.current(note.content);
      typedRef.current = true;
    }
  }, [note]);

  /** Never rejects: failures surface as `saveError` and are retried on the next edit. */
  const save = async () => {
    timerRef.current = null;
    const content = latestRef.current;
    try {
      if (noteIdRef.current !== null) {
        await editNoteRef.current(noteIdRef.current, { content });
        setSaveError(false);
        return;
      }
      if (creatingRef.current) return; // the in-flight create will pick up latestRef
      if (!content.trim()) return; // nothing worth creating a note for
      if (!notesLoadedRef.current) {
        // Today's note may already exist but not be loaded yet; retry once it is.
        deferredRef.current = true;
        return;
      }
      creatingRef.current = true;
      try {
        const created = await addNoteRef.current(
          "standup",
          content,
          referenceIdRef.current,
          titleRef.current,
        );
        noteIdRef.current = created.id;
        if (latestRef.current !== content) {
          await editNoteRef.current(created.id, { content: latestRef.current });
        }
      } finally {
        creatingRef.current = false;
      }
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  };
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  // Run a create that was held back for Notes to load. The adopt effect above
  // runs first, so an existing note is edited rather than duplicated.
  useEffect(() => {
    if (notesLoaded && deferredRef.current) {
      deferredRef.current = false;
      void saveRef.current();
    }
  }, [notesLoaded, note]);

  // Flush a pending save on unmount so the last keystrokes aren't lost.
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        void saveRef.current();
      }
    },
    [],
  );

  const handleChange = (value: string) => {
    typedRef.current = true;
    latestRef.current = value;
    setText(value);
    onChange(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void saveRef.current(), SAVE_DEBOUNCE_MS);
  };

  return { text, onChange: handleChange, saveError, title };
}
