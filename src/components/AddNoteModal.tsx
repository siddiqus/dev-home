import React, { useState, useEffect, useMemo } from "react";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import { Note, NoteType } from "../types";

interface AddNoteModalProps {
  show: boolean;
  onHide: () => void;
  onSave: (type: NoteType, content: string, referenceId?: string) => Promise<void>;
  editingNote?: Note | null;
  onEdit?: (id: number, updates: { content?: string; reference_id?: string }) => Promise<void>;
}

const JIRA_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;
const GITHUB_PATTERN = /\bhttps?:\/\/github\.com\/[^\s/]+\/[^\s/]+(?:\/pull\/\d+)?\b/;

function detectNote(text: string): { type: NoteType; referenceId: string; content: string } {
  const jiraMatch = JIRA_PATTERN.exec(text);
  const githubMatch = GITHUB_PATTERN.exec(text);

  // Whichever appears first in the text wins
  if (jiraMatch && (!githubMatch || jiraMatch.index <= githubMatch.index)) {
    const referenceId = jiraMatch[1];
    const content = text.slice(0, jiraMatch.index).trim() + " " + text.slice(jiraMatch.index + jiraMatch[0].length).trim();
    return { type: "jira_ticket", referenceId, content: content.trim() };
  }

  if (githubMatch) {
    const referenceId = githubMatch[0];
    const content = text.slice(0, githubMatch.index).trim() + " " + text.slice(githubMatch.index + githubMatch[0].length).trim();
    return { type: "github_pr", referenceId, content: content.trim() };
  }

  return { type: "free_text", referenceId: "", content: text.trim() };
}

const TYPE_LABELS: Record<NoteType, string> = {
  free_text: "Note",
  jira_ticket: "JIRA Ticket",
  github_pr: "GitHub PR",
};

const TYPE_BADGE_CLASSES: Record<NoteType, string> = {
  free_text: "badge-status-neutral",
  jira_ticket: "badge-status-blue",
  github_pr: "badge-status-green",
};

export const AddNoteModal: React.FC<AddNoteModalProps> = ({
  show,
  onHide,
  onSave,
  editingNote,
  onEdit,
}) => {
  const isEditing = !!editingNote;
  const [rawText, setRawText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For editing mode, reconstruct the raw text from the note
  useEffect(() => {
    if (editingNote) {
      if (editingNote.type === "free_text") {
        setRawText(editingNote.content || "");
      } else {
        const parts = [editingNote.reference_id || "", editingNote.content || ""].filter(Boolean);
        setRawText(parts.join(" "));
      }
      setError(null);
    }
  }, [editingNote]);

  const detected = useMemo(() => detectNote(rawText), [rawText]);

  const resetForm = () => {
    setRawText("");
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onHide();
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEditing && onEdit) {
        const updates: { content?: string; reference_id?: string } = {
          content: detected.content,
        };
        if (detected.type !== "free_text") {
          updates.reference_id = detected.referenceId;
        }
        await onEdit(editingNote.id, updates);
      } else {
        await onSave(
          detected.type,
          detected.content,
          detected.type !== "free_text" ? detected.referenceId : undefined,
        );
      }
      resetForm();
      onHide();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Failed to save note.");
    } finally {
      setSaving(false);
    }
  };

  const canSave = rawText.trim().length > 0;

  return (
    <Modal show={show} onHide={handleClose} centered className="description-modal">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: "1rem", fontWeight: 600 }}>
          {isEditing ? "Edit Note" : "Add Note"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.8125rem" }}>
            {error}
          </div>
        )}

        <Form.Group>
          <Form.Label className="text-secondary-custom" style={{ fontSize: "0.8125rem" }}>
            Note
          </Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            size="sm"
            placeholder="Write a note, paste a JIRA ticket (PROJ-123), or a GitHub URL..."
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            autoFocus
          />
        </Form.Group>

        {rawText.trim().length > 0 && (
          <div className="d-flex align-items-center gap-2 mt-2">
            <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
              Detected:
            </span>
            <Badge className={TYPE_BADGE_CLASSES[detected.type]} style={{ fontSize: "0.6875rem" }}>
              {TYPE_LABELS[detected.type]}
            </Badge>
            {detected.referenceId && (
              <span className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                {detected.referenceId}
              </span>
            )}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !canSave}>
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
      </Modal.Footer>
    </Modal>
  );
};
