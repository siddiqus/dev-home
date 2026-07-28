import React, { useState, useMemo, useEffect, useRef } from "react";
import { GitHubPR, Note } from "../types";
import { useNotesContext } from "../context/NotesContext";
import { prNoteKey, notesForPr } from "../utils/prNotes";
import { getNoteDisplayTitle } from "../utils/text";
import { describeReminder } from "../utils/time";
import { ReminderControl } from "./ReminderControl";
import {
  IconPlus,
  IconCheck,
  IconPin,
  IconPinFilled,
  IconTrash,
  IconPencil,
  IconX,
  IconBell,
} from "@tabler/icons-react";
import "./PrNotesPanel.css";

interface PrNotesPanelProps {
  pr: GitHubPR;
}

interface NoteEditorProps {
  initialTitle?: string;
  initialContent?: string;
  initialRemindAt?: string | null;
  onSave: (content: string, title: string, remindAt: string | null) => void;
  onCancel: () => void;
}

function NoteEditor({
  initialTitle = "",
  initialContent = "",
  initialRemindAt = null,
  onSave,
  onCancel,
}: NoteEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [remindAt, setRemindAt] = useState<string | null>(initialRemindAt);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Focus the content field as soon as the editor opens so the user can type
  // immediately — whether opened via the "+ Add" button, inline edit, or the
  // new-note keyboard shortcut.
  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  const canSave = content.trim().length > 0;

  return (
    <div className="pr-notes-editor">
      <input
        type="text"
        className="pr-notes-title-input"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        ref={contentRef}
        className="pr-notes-content-textarea"
        placeholder="Note content..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
      />
      <ReminderControl value={remindAt} onChange={setRemindAt} />
      <div className="pr-notes-editor-actions">
        <button
          type="button"
          className="pr-notes-btn pr-notes-btn--primary"
          disabled={!canSave}
          onClick={() => onSave(content.trim(), title.trim(), remindAt)}
        >
          Save
        </button>
        <button type="button" className="pr-notes-btn pr-notes-btn--secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface PrNoteItemProps {
  note: Note;
  onResolve: (id: number) => void;
  onUnresolve: (id: number) => void;
  onPin: (id: number) => void;
  onUnpin: (id: number) => void;
  onEdit: (id: number, content: string, title: string, remindAt: string | null) => void;
  onDelete: (id: number) => void;
}

function PrNoteItem({
  note,
  onResolve,
  onUnresolve,
  onPin,
  onUnpin,
  onEdit,
  onDelete,
}: PrNoteItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const isResolved = note.resolved === 1;
  const isPinned = note.pinned === 1;
  const displayTitle = getNoteDisplayTitle(note);
  const reminder = note.remind_at ? describeReminder(note.remind_at) : null;
  // Alert styling only while the note is still actionable (unresolved).
  const reminderIsAlerting = reminder?.overdue === true && note.resolved === 0;

  if (isEditing) {
    return (
      <div className="pr-note-item">
        <NoteEditor
          initialTitle={note.title}
          initialContent={note.content}
          initialRemindAt={note.remind_at}
          onSave={(content, title, remindAt) => {
            onEdit(note.id, content, title, remindAt);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className={`pr-note-item ${isResolved ? "is-resolved" : ""}`}>
      <div className="pr-note-header">
        {isPinned && (
          <span className="pr-note-pin-indicator" title="Pinned">
            <IconPinFilled size={13} stroke={1.8} />
          </span>
        )}
        <span className="pr-note-title">{displayTitle}</span>
      </div>
      <div className="pr-note-content">{note.content}</div>
      {reminder && (
        <span
          data-testid="pr-note-reminder"
          className={`pr-note-reminder ${reminderIsAlerting ? "is-alerting" : ""}`}
          title={`Reminder: ${reminder.label}`}
        >
          <IconBell size={12} stroke={1.8} />
          {reminder.label}
        </span>
      )}
      <div className="pr-note-actions">
        <button
          type="button"
          className={`pr-note-action-btn ${isResolved ? "is-active" : ""}`}
          title={isResolved ? "Unresolve" : "Resolve"}
          onClick={() => (isResolved ? onUnresolve(note.id) : onResolve(note.id))}
        >
          <IconCheck size={14} stroke={1.5} />
        </button>
        <button
          type="button"
          className={`pr-note-action-btn ${isPinned ? "is-active" : ""}`}
          title={isPinned ? "Unpin" : "Pin"}
          onClick={() => (isPinned ? onUnpin(note.id) : onPin(note.id))}
        >
          {isPinned ? <IconPinFilled size={14} stroke={1.5} /> : <IconPin size={14} stroke={1.5} />}
        </button>
        <button
          type="button"
          className="pr-note-action-btn"
          title="Edit"
          onClick={() => setIsEditing(true)}
        >
          <IconPencil size={14} stroke={1.5} />
        </button>
        <button
          type="button"
          className="pr-note-action-btn"
          title="Delete"
          onClick={() => {
            if (window.confirm("Are you sure you want to delete this note?")) {
              onDelete(note.id);
            }
          }}
        >
          <IconTrash size={14} stroke={1.5} />
        </button>
      </div>
    </div>
  );
}

export function PrNotesPanel({ pr }: PrNotesPanelProps) {
  const { notes, addNote, editNote, resolveNote, unresolveNote, pinNote, unpinNote, removeNote } =
    useNotesContext();
  const [showComposer, setShowComposer] = useState(false);

  // While a PR modal is open (this panel is only mounted then), the new-note
  // shortcut opens this composer so the note is linked to the PR, instead of the
  // app-level note editor. Capture phase + stopPropagation pre-empts the global
  // handler in useKeyboardShortcuts (which listens in the bubble phase).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        e.stopPropagation();
        setShowComposer(true);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const matched = useMemo(() => notesForPr(notes, pr), [notes, pr]);
  const unresolvedCount = matched.filter((n) => n.resolved === 0).length;

  const handleAddNote = async (content: string, title: string, remindAt: string | null) => {
    await addNote("github_pr", content, prNoteKey(pr), title || undefined, remindAt);
    setShowComposer(false);
  };

  const handleEditNote = async (
    id: number,
    content: string,
    title: string,
    remindAt: string | null,
  ) => {
    await editNote(id, { content, title: title || undefined, remind_at: remindAt });
  };

  const handleResolve = async (id: number) => {
    await resolveNote(id);
  };

  const handleUnresolve = async (id: number) => {
    await unresolveNote(id);
  };

  const handlePin = async (id: number) => {
    await pinNote(id);
  };

  const handleUnpin = async (id: number) => {
    await unpinNote(id);
  };

  const handleDelete = async (id: number) => {
    await removeNote(id);
  };

  return (
    <div className="pr-notes-panel">
      <div className="modal-body-section-header">
        <span>Notes ({unresolvedCount})</span>
        <button
          type="button"
          className="pr-notes-add-btn"
          title={showComposer ? "Close" : "Add note"}
          onClick={() => setShowComposer(!showComposer)}
        >
          {showComposer ? <IconX size={16} stroke={1.5} /> : <IconPlus size={16} stroke={1.5} />}
        </button>
      </div>

      {showComposer && (
        <NoteEditor onSave={handleAddNote} onCancel={() => setShowComposer(false)} />
      )}

      {matched.length === 0 && !showComposer && (
        <div className="pr-notes-empty">No notes for this PR yet.</div>
      )}

      {matched.length > 0 && (
        <div className="pr-notes-list">
          {matched.map((note) => (
            <PrNoteItem
              key={note.id}
              note={note}
              onResolve={handleResolve}
              onUnresolve={handleUnresolve}
              onPin={handlePin}
              onUnpin={handleUnpin}
              onEdit={handleEditNote}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
