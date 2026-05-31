import React, { useState, useEffect, useMemo } from "react";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { Note, NoteType } from "../../types";
import { detectNote } from "../../utils/noteDetection";
import { getReferenceUrl } from "../../utils/text";
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

function getDefaultTitle(note: Note): string {
  if (note.title) return note.title;
  if (note.reference_id) return note.reference_id;
  return "";
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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "tiptap-link" },
      }),
      Placeholder.configure({
        placeholder:
          "Write a note (supports markdown), paste a JIRA ticket (PROJ-123), or a GitHub URL...",
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

  // Track dirty state from title and editor content changes
  useEffect(() => {
    setIsDirty(editorContent.trim() !== initialContent.trim() || titleText !== initialTitle);
  }, [titleText, initialTitle, initialContent, editorContent]);

  // Load note content when modal opens
  useEffect(() => {
    if (!editor || !show) return;

    if (note) {
      const rawText = reconstructRawText(note);
      const title = getDefaultTitle(note);
      setTitleText(title);
      setInitialTitle(title);
      editor.commands.setContent(rawText);
      setEditorContent(rawText);
      setInitialContent(rawText);
      setIsDirty(false);
    } else {
      setTitleText("");
      setInitialTitle("");
      editor.commands.setContent("");
      setEditorContent("");
      setInitialContent("");
      setIsDirty(false);
    }
    setError(null);
  }, [note, show, editor]);

  const handleClose = () => {
    setTitleText("");
    setInitialTitle("");
    setInitialContent("");
    setEditorContent("");
    setIsDirty(false);
    setError(null);
    editor?.commands.setContent("");
    onHide();
  };

  const handleSave = async () => {
    if (!editor) return;

    const markdown = getMarkdown(editor);
    const detected = detectNote(markdown);

    setSaving(true);
    setError(null);
    try {
      if (isEditing && onEdit) {
        const updates: { title?: string; content?: string; reference_id?: string } = {
          title: titleText.trim(),
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
          titleText.trim() || undefined,
        );
      }
      handleClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Failed to save note.");
    } finally {
      setSaving(false);
    }
  };

  // Compute reference URL: from existing note when editing, or live-detected from editor content
  const referenceUrl = useMemo(() => {
    if (note) return getReferenceUrl(note, jiraBaseUrl);
    if (!editorContent.trim()) return null;
    const detected = detectNote(editorContent);
    if (detected.type === "free_text" || !detected.referenceId) return null;
    // Build a synthetic note to reuse getReferenceUrl logic
    return getReferenceUrl(
      { reference_id: detected.referenceId, type: detected.type } as Note,
      jiraBaseUrl,
    );
  }, [note, editorContent, jiraBaseUrl]);

  const hasContent = editorContent.trim().length > 0;
  const canSave = isEditing ? isDirty : hasContent;

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered className="description-modal">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: "1rem", fontWeight: 600 }}>
          {isEditing ? "Note" : "New Note"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.8125rem" }}>
            {error}
          </div>
        )}

        <Form.Group className="mb-3">
          <Form.Control
            size="sm"
            placeholder="Title (optional)"
            value={titleText}
            onChange={(e) => setTitleText(e.target.value)}
            autoFocus={!isEditing}
          />
        </Form.Group>

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
        <Button variant="outline-secondary" size="sm" onClick={handleClose}>
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
              "Save Changes"
            ) : (
              "Add Note"
            )}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};
