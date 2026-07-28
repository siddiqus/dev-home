import React, { useState, useEffect, useMemo, useCallback } from "react";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { IconBell } from "@tabler/icons-react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { Note, NoteType } from "../../types";
import { detectNote } from "../../utils/noteDetection";
import { getReferenceUrl, deriveTitleFromContent } from "../../utils/text";
import { EditorToolbar } from "./EditorToolbar";
import "./notes.css";
import "./tiptap.css";

// tiptap-markdown doesn't ship type declarations for its storage
function getMarkdown(editor: Editor): string {
  return (editor.storage as any).markdown.getMarkdown();
}

interface NoteEditorModalProps {
  show: boolean;
  onHide: () => void;
  onSave: (
    type: NoteType,
    content: string,
    referenceId?: string,
    title?: string,
    remindAt?: string | null,
  ) => Promise<void>;
  onEdit?: (
    id: number,
    updates: {
      title?: string;
      content?: string;
      reference_id?: string;
      remind_at?: string | null;
    },
  ) => Promise<void>;
  note?: Note | null;
  jiraBaseUrl: string;
}

function reconstructRawText(note: Note): string {
  return note.content || "";
}

const pad = (n: number) => String(n).padStart(2, "0");

// ISO-8601 UTC -> value for an <input type="datetime-local"> (local wall-clock).
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// <input type="datetime-local"> value (local) -> ISO-8601 UTC, or null if empty/invalid.
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// datetime-local value for `now + 1 hour`.
function presetInOneHour(): string {
  return isoToLocalInput(new Date(Date.now() + 60 * 60 * 1000).toISOString());
}

// datetime-local value for tomorrow at 09:00 local.
function presetTomorrow9am(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return isoToLocalInput(d.toISOString());
}

export const NoteEditorModal: React.FC<NoteEditorModalProps> = ({
  show,
  onHide,
  onSave,
  onEdit,
  note,
  jiraBaseUrl,
}) => {
  const isEditing = !!note;
  const [titleText, setTitleText] = useState("");
  const [initialTitle, setInitialTitle] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const [remindAt, setRemindAt] = useState("");
  const [initialRemindAt, setInitialRemindAt] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "tiptap-link" },
      }),
      Placeholder.configure({
        placeholder: "Start typing... (supports markdown, paste a JIRA ticket or GitHub URL)",
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: "",
    onUpdate: ({ editor: e }) => {
      setEditorContent(getMarkdown(e));
    },
  });

  // Track dirty state from editor content or title changes
  useEffect(() => {
    const contentChanged = editorContent.trim() !== initialContent.trim();
    const titleChanged = titleText.trim() !== initialTitle.trim();
    const remindChanged = remindAt !== initialRemindAt;
    setIsDirty(contentChanged || titleChanged || remindChanged);
  }, [initialContent, editorContent, titleText, initialTitle, remindAt, initialRemindAt]);

  // Load note content when modal opens
  useEffect(() => {
    if (!editor || !show) return;

    if (note) {
      const rawText = reconstructRawText(note);
      editor.commands.setContent(rawText);
      setEditorContent(rawText);
      setInitialContent(rawText);
      setTitleText(note.title || "");
      setInitialTitle(note.title || "");
      const localRemind = isoToLocalInput(note.remind_at);
      setRemindAt(localRemind);
      setInitialRemindAt(localRemind);
      setIsDirty(false);
    } else {
      editor.commands.setContent("");
      setEditorContent("");
      setInitialContent("");
      setTitleText("");
      setInitialTitle("");
      setRemindAt("");
      setInitialRemindAt("");
      setIsDirty(false);
    }
    setError(null);
  }, [note, show, editor]);

  // Auto-focus editor when modal opens
  useEffect(() => {
    if (!editor || !show) return;
    const timer = setTimeout(() => editor.commands.focus("end"), 50);
    return () => clearTimeout(timer);
  }, [editor, show]);

  const handleClose = useCallback(() => {
    setTitleText("");
    setInitialTitle("");
    setInitialContent("");
    setEditorContent("");
    setRemindAt("");
    setInitialRemindAt("");
    setIsDirty(false);
    setError(null);
    setShowDismissConfirm(false);
    editor?.commands.setContent("");
    onHide();
  }, [editor, onHide]);

  const handleDismiss = useCallback(() => {
    if (isDirty) {
      setShowDismissConfirm(true);
      return;
    }
    handleClose();
  }, [isDirty, handleClose]);

  // ESC key handler
  useEffect(() => {
    if (!show) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleDismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [show, handleDismiss]);

  const handleSave = useCallback(async () => {
    if (!editor) return;

    const markdown = getMarkdown(editor);
    const detected = detectNote(markdown);
    const autoTitle = deriveTitleFromContent(markdown);

    setSaving(true);
    setError(null);
    try {
      const title = titleText.trim() || autoTitle;
      const remindIso = localInputToIso(remindAt);
      if (isEditing && onEdit) {
        const updates: {
          title?: string;
          content?: string;
          reference_id?: string;
          remind_at?: string | null;
        } = {
          title,
          content: markdown,
          remind_at: remindIso,
        };
        if (detected.type !== "free_text") {
          updates.reference_id = detected.referenceId;
        }
        await onEdit(note.id, updates);
      } else {
        await onSave(
          detected.type,
          markdown,
          detected.type !== "free_text" ? detected.referenceId : undefined,
          title,
          remindIso,
        );
      }
      handleClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Failed to save note.");
    } finally {
      setSaving(false);
    }
  }, [editor, titleText, isEditing, onEdit, note, onSave, handleClose, remindAt]);

  // Compute reference URL: from existing note when editing, or live-detected from editor content
  const referenceUrl = useMemo(() => {
    if (note) return getReferenceUrl(note, jiraBaseUrl);
    if (!editorContent.trim()) return null;
    const detected = detectNote(editorContent);
    if (detected.type === "free_text" || !detected.referenceId) return null;
    return getReferenceUrl(
      { reference_id: detected.referenceId, type: detected.type } as Note,
      jiraBaseUrl,
    );
  }, [note, editorContent, jiraBaseUrl]);

  const hasContent = editorContent.trim().length > 0;
  const canSave = isEditing ? isDirty : hasContent;

  // Cmd+Enter (macOS) / Ctrl+Enter (Windows/Linux) saves the note
  useEffect(() => {
    if (!show) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (canSave && !saving) handleSave();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [show, canSave, saving, handleSave]);

  const titlePlaceholder = useMemo(() => {
    return hasContent ? deriveTitleFromContent(editorContent) : "Untitled";
  }, [hasContent, editorContent]);

  const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const saveShortcutHint = isMac ? "⌘↵" : "Ctrl ↵";

  return (
    <Modal
      show={show}
      onHide={handleDismiss}
      size="lg"
      centered
      className="description-modal"
      keyboard={false}
    >
      <Modal.Header closeButton>
        <input
          type="text"
          value={titleText}
          onChange={(e) => setTitleText(e.target.value)}
          placeholder={titlePlaceholder}
          style={{
            fontSize: "0.8125rem",
            fontWeight: 500,
            color: "var(--color-text-primary)",
            background: "transparent",
            border: "none",
            outline: "none",
            width: "calc(100% - 40px)",
            padding: 0,
          }}
        />
      </Modal.Header>
      <Modal.Body style={{ padding: 0 }}>
        {error && (
          <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.8125rem" }}>
            {error}
          </div>
        )}

        <div className="tiptap-editor-wrapper">
          <EditorToolbar editor={editor} />
          <EditorContent editor={editor} />
        </div>

        <div
          className="d-flex align-items-center gap-2 m-3"
          style={{ fontSize: "0.8125rem", flexWrap: "wrap" }}
        >
          <span className="d-flex align-items-center gap-1 text-secondary-custom">
            <IconBell size={14} stroke={1.8} />
            Remind me
          </span>
          <input
            type="datetime-local"
            className="form-control form-control-sm"
            style={{ width: "auto", fontSize: "0.8125rem" }}
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
          />
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setRemindAt(presetInOneHour())}
          >
            In 1h
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setRemindAt(presetTomorrow9am())}
          >
            Tomorrow 9am
          </Button>
          {remindAt && (
            <Button variant="outline-secondary" size="sm" onClick={() => setRemindAt("")}>
              Clear
            </Button>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        {referenceUrl && (
          <a
            href={referenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.8125rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            className="me-auto text-truncate-custom"
            title={referenceUrl}
          >
            {referenceUrl}
          </a>
        )}
        <Button variant="outline-secondary" size="sm" onClick={handleDismiss}>
          {isEditing ? "Close" : "Cancel"}
        </Button>
        {canSave && (
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Saving...
              </>
            ) : isEditing ? (
              `Save Changes (${saveShortcutHint})`
            ) : (
              `Add Note (${saveShortcutHint})`
            )}
          </Button>
        )}
      </Modal.Footer>

      <Modal
        show={showDismissConfirm}
        onHide={() => setShowDismissConfirm(false)}
        size="sm"
        centered
        backdrop="static"
        className="dismiss-confirm-modal"
      >
        <Modal.Body style={{ padding: "1rem", fontSize: "0.8125rem" }}>
          <p style={{ marginBottom: "0.75rem" }}>You have unsaved changes. Save this note?</p>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setShowDismissConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => {
                setShowDismissConfirm(false);
                handleClose();
              }}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                setShowDismissConfirm(false);
                await handleSave();
              }}
            >
              Save
            </Button>
          </div>
        </Modal.Body>
      </Modal>
    </Modal>
  );
};
