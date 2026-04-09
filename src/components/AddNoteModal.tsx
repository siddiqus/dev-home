import React, { useState, useEffect, useMemo } from "react";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { Note, NoteType } from "../types";

interface AddNoteModalProps {
  show: boolean;
  onHide: () => void;
  onSave: (type: NoteType, content: string, referenceId?: string) => Promise<void>;
  editingNote?: Note | null;
  onEdit?: (id: number, updates: { content?: string; reference_id?: string }) => Promise<void>;
}

/** Trim leading/trailing blank lines and whitespace, but preserve internal newlines */
function trimEnds(s: string): string {
  return s
    .replace(/^\s*\n/, "")
    .replace(/\n\s*$/, "")
    .trim();
}

// Matches a full JIRA URL like https://org.atlassian.net/browse/PROJ-123
const JIRA_URL_PATTERN = /\bhttps?:\/\/[^\s/]+\/browse\/([A-Z][A-Z0-9]+-\d+)\b/;
// Matches a bare JIRA key like PROJ-123
const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;
const GITHUB_PATTERN = /\bhttps?:\/\/github\.com\/[^\s/]+\/[^\s/]+(?:\/pull\/\d+)?\b/;

function detectNote(text: string): { type: NoteType; referenceId: string; content: string } {
  const lines = text.split("\n");
  const firstLine = lines[0] || "";

  // Try JIRA URL first (full URL match extracts the key, strips entire URL)
  const jiraUrlMatch = JIRA_URL_PATTERN.exec(firstLine);
  // Then try bare JIRA key
  const jiraKeyMatch = !jiraUrlMatch ? JIRA_KEY_PATTERN.exec(firstLine) : null;
  const githubMatch = GITHUB_PATTERN.exec(firstLine);

  // Pick the JIRA match (URL takes priority over bare key)
  const jiraMatch = jiraUrlMatch || jiraKeyMatch;
  const jiraIndex = jiraMatch ? jiraMatch.index : Infinity;
  const githubIndex = githubMatch ? githubMatch.index : Infinity;

  if (jiraMatch && jiraIndex <= githubIndex) {
    const referenceId = jiraMatch[1]; // captured group is the key in both patterns
    const restOfFirstLine = (
      firstLine.slice(0, jiraMatch.index) + firstLine.slice(jiraMatch.index + jiraMatch[0].length)
    ).trim();
    const restOfLines = lines.slice(1).join("\n");
    const content = restOfFirstLine
      ? restOfFirstLine + (restOfLines ? "\n" + restOfLines : "")
      : restOfLines;
    return { type: "jira_ticket", referenceId, content: trimEnds(content) };
  }

  if (githubMatch) {
    const referenceId = githubMatch[0];
    const restOfFirstLine = (
      firstLine.slice(0, githubMatch.index) +
      firstLine.slice(githubMatch.index + githubMatch[0].length)
    ).trim();
    const restOfLines = lines.slice(1).join("\n");
    const content = restOfFirstLine
      ? restOfFirstLine + (restOfLines ? "\n" + restOfLines : "")
      : restOfLines;
    return { type: "github_pr", referenceId, content: trimEnds(content) };
  }

  return { type: "free_text", referenceId: "", content: trimEnds(text) };
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
        setRawText(parts.join("\n"));
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
          {/* <Form.Label className="text-secondary-custom" style={{ fontSize: "0.8125rem" }}>
            Note
          </Form.Label> */}
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

        {/* {rawText.trim().length > 0 && (
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
        )} */}
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
