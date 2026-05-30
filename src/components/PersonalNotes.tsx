import React from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { Badge } from "./primitives/Badge";
import { SectionHeader } from "./primitives/SectionHeader";
import {
  IconNote,
  IconBrandJira,
  IconGitPullRequest,
  IconLink,
  IconCheck,
  IconTrash,
  IconPlus,
} from "@tabler/icons-react";
import { Note } from "../types";
import { getReferenceUrl, getNoteDisplayTitle } from "../utils/text";
import { formatRelativeTime } from "../utils/time";
import { EmptyState } from "./EmptyState";

interface PersonalNotesProps {
  notes: Note[];
  loading: boolean;
  onResolve: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onOpenNote: (note: Note) => void;
  onAdd: () => void;
  jiraBaseUrl: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  free_text: <IconNote size={14} stroke={1.8} />,
  jira_ticket: <IconBrandJira size={14} stroke={1.8} />,
  github_pr: <IconGitPullRequest size={14} stroke={1.8} />,
  link: <IconLink size={14} stroke={1.8} />,
};

const TYPE_LABEL: Record<string, string> = {
  free_text: "Note",
  jira_ticket: "JIRA",
  github_pr: "PR",
  link: "Link",
};

export const PersonalNotes: React.FC<PersonalNotesProps> = ({
  notes,
  loading,
  onResolve,
  onDelete,
  onOpenNote,
  onAdd,
  jiraBaseUrl,
}) => {
  if (loading && notes.length === 0) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <EmptyState
        icon={<IconNote size={48} stroke={1} />}
        title="No notes"
        description="Add a note using the button below."
        action={
          <Button variant="outline-secondary" size="sm" className="mt-2" onClick={onAdd}>
            <IconPlus size={14} className="me-1" />
            Add Note
          </Button>
        }
      />
    );
  }

  const unresolved = notes.filter((n) => n.resolved === 0);
  const resolved = notes.filter((n) => n.resolved === 1);

  return (
    <div>
      <div className="d-flex justify-content-end mb-2">
        <Button variant="outline-secondary" size="sm" onClick={onAdd}>
          <IconPlus size={14} className="me-1" />
          Add Note
        </Button>
      </div>
      {unresolved.length > 0 && (
        <Card className="mb-3">
          <Card.Body className="p-0">
            <SectionHeader className="px-3 pt-3 mb-0">
              <IconNote size={13} stroke={1.8} />
              <span>Unresolved</span>
              <Badge variant="warning">{unresolved.length}</Badge>
            </SectionHeader>
            <div style={{ marginTop: 8 }}>
              {unresolved.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  jiraBaseUrl={jiraBaseUrl}
                  onResolve={onResolve}
                  onDelete={onDelete}
                  onOpenNote={onOpenNote}
                />
              ))}
            </div>
          </Card.Body>
        </Card>
      )}

      {resolved.length > 0 && (
        <Card>
          <Card.Body className="p-0">
            <SectionHeader className="px-3 pt-3 mb-0">
              <IconCheck size={13} stroke={1.8} />
              <span>Resolved</span>
              <Badge variant="success">{resolved.length}</Badge>
            </SectionHeader>
            <div style={{ marginTop: 8 }}>
              {resolved.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  jiraBaseUrl={jiraBaseUrl}
                  onResolve={onResolve}
                  onDelete={onDelete}
                  onOpenNote={onOpenNote}
                />
              ))}
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  );
};

function NoteRow({
  note,
  jiraBaseUrl,
  onResolve,
  onDelete,
  onOpenNote,
}: {
  note: Note;
  jiraBaseUrl: string;
  onResolve: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onOpenNote: (note: Note) => void;
}) {
  const url = getReferenceUrl(note, jiraBaseUrl);
  const title = getNoteDisplayTitle(note);

  return (
    <div
      className="summary-item d-flex align-items-center gap-3 px-3 py-2"
      style={{ cursor: "pointer" }}
      onClick={() => onOpenNote(note)}
    >
      <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
        {TYPE_ICON[note.type]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="d-flex align-items-center gap-2">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-truncate-custom"
              style={{ fontWeight: 500, fontSize: "0.8125rem" }}
              onClick={(e) => e.stopPropagation()}
            >
              {title}
            </a>
          ) : (
            <span
              className="text-truncate-custom"
              style={{ fontWeight: 500, fontSize: "0.8125rem" }}
            >
              {title}
            </span>
          )}
          <span
            className="text-secondary-custom"
            style={{ fontSize: "0.6875rem", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {formatRelativeTime(note.created_at)}
          </span>
        </div>
        {note.content && (
          <div
            className="text-secondary-custom note-content-truncate"
            style={{ fontSize: "0.75rem", marginTop: 1 }}
          >
            {note.content}
          </div>
        )}
      </div>
      <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
        <Badge variant="neutral">{TYPE_LABEL[note.type]}</Badge>
        {note.resolved === 0 && (
          <Button
            variant="outline-secondary"
            size="sm"
            style={{ padding: "2px 6px" }}
            title="Resolve"
            onClick={(e) => {
              e.stopPropagation();
              onResolve(note.id);
            }}
          >
            <IconCheck size={12} />
          </Button>
        )}
        <Button
          variant="outline-secondary"
          size="sm"
          style={{ padding: "2px 6px" }}
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm("Are you sure you want to delete this note?")) {
              onDelete(note.id);
            }
          }}
        >
          <IconTrash size={12} />
        </Button>
      </div>
    </div>
  );
}
