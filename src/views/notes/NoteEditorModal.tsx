import React, { useState, useEffect, useMemo, useCallback } from "react";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
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
  onSave: (type: NoteType, content: string, referenceId?: string, title?: string) => Promise<void>;
  onEdit?: (
    id: number,
    updates: { title?: string; content?: string; reference_id?: string },
  ) => Promise<void>;
  note?: Note | null;
  jiraBaseUrl: string;
}

function reconstructRawText(note: Note): string {
  return note.content || "";
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
    setIsDirty(contentChanged || titleChanged);
  }, [initialContent, editorContent, titleText, initialTitle]);

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
      setIsDirty(false);
    } else {
      editor.commands.setContent("");
      setEditorContent("");
      setInitialContent("");
      setTitleText("");
      setInitialTitle("");
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
      if (isEditing && onEdit) {
        const updates: { title?: string; content?: string; reference_id?: string } = {
          title,
          content: markdown,
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
        );
      }
      handleClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Failed to save note.");
    } finally {
      setSaving(false);
    }
  }, [editor, titleText, isEditing, onEdit, note, onSave, handleClose]);

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
