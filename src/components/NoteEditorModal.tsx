import React, { useState, useEffect, useCallback } from "react";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListNumbers,
  IconBlockquote,
  IconTerminal,
  IconLink,
  IconMinus,
} from "@tabler/icons-react";
import { Note, NoteType } from "../types";
import { detectNote } from "../utils/noteDetection";

// tiptap-markdown doesn't ship type declarations for its storage
function getMarkdown(editor: Editor): string {
  return (editor.storage as any).markdown.getMarkdown();
}

interface NoteEditorModalProps {
  show: boolean;
  onHide: () => void;
  onSave: (type: NoteType, content: string, referenceId?: string, title?: string) => Promise<void>;
  onEdit?: (id: number, updates: { title?: string; content?: string; reference_id?: string }) => Promise<void>;
  note?: Note | null;
  jiraBaseUrl: string;
}

function getReferenceUrl(note: Note, jiraBaseUrl: string): string | null {
  if (note.type === "jira_ticket" && note.reference_id) {
    const base = jiraBaseUrl.replace(/\/+$/, "");
    return base ? `${base}/browse/${note.reference_id}` : null;
  }
  if (note.type === "github_pr" && note.reference_id) {
    return note.reference_id;
  }
  return null;
}

function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const addLink = useCallback(() => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  return (
    <div className="tiptap-toolbar">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive("bold") ? "is-active" : ""}
        title="Bold"
      >
        <IconBold size={14} stroke={1.8} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive("italic") ? "is-active" : ""}
        title="Italic"
      >
        <IconItalic size={14} stroke={1.8} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive("strike") ? "is-active" : ""}
        title="Strikethrough"
      >
        <IconStrikethrough size={14} stroke={1.8} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={editor.isActive("code") ? "is-active" : ""}
        title="Inline code"
      >
        <IconCode size={14} stroke={1.8} />
      </button>

      <div className="toolbar-divider" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={editor.isActive("heading", { level: 1 }) ? "is-active" : ""}
        title="Heading 1"
      >
        <IconH1 size={14} stroke={1.8} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={editor.isActive("heading", { level: 2 }) ? "is-active" : ""}
        title="Heading 2"
      >
        <IconH2 size={14} stroke={1.8} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={editor.isActive("heading", { level: 3 }) ? "is-active" : ""}
        title="Heading 3"
      >
        <IconH3 size={14} stroke={1.8} />
      </button>

      <div className="toolbar-divider" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive("bulletList") ? "is-active" : ""}
        title="Bullet list"
      >
        <IconList size={14} stroke={1.8} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive("orderedList") ? "is-active" : ""}
        title="Ordered list"
      >
        <IconListNumbers size={14} stroke={1.8} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={editor.isActive("blockquote") ? "is-active" : ""}
        title="Blockquote"
      >
        <IconBlockquote size={14} stroke={1.8} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={editor.isActive("codeBlock") ? "is-active" : ""}
        title="Code block"
      >
        <IconTerminal size={14} stroke={1.8} />
      </button>

      <div className="toolbar-divider" />

      <button
        type="button"
        onClick={addLink}
        className={editor.isActive("link") ? "is-active" : ""}
        title="Link"
      >
        <IconLink size={14} stroke={1.8} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        <IconMinus size={14} stroke={1.8} />
      </button>
    </div>
  );
}

function reconstructRawText(note: Note): string {
  if (note.type === "free_text") {
    return note.content || "";
  }
  return [note.reference_id || "", note.content || ""].filter(Boolean).join("\n");
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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "tiptap-link" },
      }),
      Placeholder.configure({
        placeholder: "Write a note (supports markdown), paste a JIRA ticket (PROJ-123), or a GitHub URL...",
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: "",
    onUpdate: ({ editor: e }) => {
      const currentMarkdown = getMarkdown(e);
      setIsDirty(currentMarkdown.trim() !== initialContent.trim() || titleText !== initialTitle);
    },
  });

  // Track title changes for dirty detection
  useEffect(() => {
    if (!editor) return;
    const currentMarkdown = getMarkdown(editor);
    setIsDirty(currentMarkdown.trim() !== initialContent.trim() || titleText !== initialTitle);
  }, [titleText, initialTitle, initialContent, editor]);

  // Load note content when modal opens
  useEffect(() => {
    if (!editor || !show) return;

    if (note) {
      const rawText = reconstructRawText(note);
      const title = getDefaultTitle(note);
      setTitleText(title);
      setInitialTitle(title);
      editor.commands.setContent(rawText);
      setInitialContent(rawText);
      setIsDirty(false);
    } else {
      setTitleText("");
      setInitialTitle("");
      editor.commands.setContent("");
      setInitialContent("");
      setIsDirty(false);
    }
    setError(null);
  }, [note, show, editor]);

  const handleClose = () => {
    setTitleText("");
    setInitialTitle("");
    setInitialContent("");
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
          content: detected.content,
        };
        if (detected.type !== "free_text") {
          updates.reference_id = detected.referenceId;
        }
        await onEdit(note.id, updates);
      } else {
        await onSave(
          detected.type,
          detected.content,
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

  const referenceUrl = note ? getReferenceUrl(note, jiraBaseUrl) : null;
  const hasContent = editor ? getMarkdown(editor).trim().length > 0 : false;
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
            style={{ fontSize: "0.8125rem" }}
            className="me-auto"
          >
            Open in browser
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
