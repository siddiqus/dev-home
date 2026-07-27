import React, { useState, useMemo } from "react";
import { GitHubPR, Note } from "../types";
import { useNotesContext } from "../context/NotesContext";
import { prNoteKey, notesForPr } from "../utils/prNotes";
import { getNoteDisplayTitle } from "../utils/text";
import {
  IconPlus,
  IconCheck,
  IconPin,
  IconPinFilled,
  IconTrash,
  IconPencil,
  IconX,
} from "@tabler/icons-react";
import "./PrNotesPanel.css";

interface PrNotesPanelProps {
  pr: GitHubPR;
}

interface NoteEditorProps {
  initialTitle?: string;
  initialContent?: string;
  onSave: (content: string, title: string) => void;
  onCancel: () => void;
}

function NoteEditor({ initialTitle = "", initialContent = "", onSave, onCancel }: NoteEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);

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
        className="pr-notes-content-textarea"
        placeholder="Note content..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
      />
      <div className="pr-notes-editor-actions">
        <button
          type="button"
          className="pr-notes-btn pr-notes-btn--primary"
          disabled={!canSave}
          onClick={() => onSave(content.trim(), title.trim())}
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
  onEdit: (id: number, content: string, title: string) => void;
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

  if (isEditing) {
    return (
      <div className="pr-note-item">
        <NoteEditor
          initialTitle={note.title}
          initialContent={note.content}
          onSave={(content, title) => {
            onEdit(note.id, content, title);
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

  const matched = useMemo(() => notesForPr(notes, pr), [notes, pr]);
  const unresolvedCount = matched.filter((n) => n.resolved === 0).length;

  const handleAddNote = async (content: string, title: string) => {
    await addNote("github_pr", content, prNoteKey(pr), title || undefined);
    setShowComposer(false);
  };

  const handleEditNote = async (id: number, content: string, title: string) => {
    await editNote(id, { content, title: title || undefined });
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
