import React from "react";
import Card from "react-bootstrap/Card";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import {
  IconNote,
  IconBrandJira,
  IconGitPullRequest,
  IconCheck,
  IconTrash,
  IconPencil,
} from "@tabler/icons-react";
import { Note } from "../types";
import { formatRelativeTime } from "../hooks/useRelativeTime";
import { EmptyState } from "./EmptyState";

interface PersonalNotesProps {
  notes: Note[];
  loading: boolean;
  onResolve: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onEdit: (note: Note) => void;
  jiraBaseUrl: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  free_text: <IconNote size={14} stroke={1.8} />,
  jira_ticket: <IconBrandJira size={14} stroke={1.8} />,
  github_pr: <IconGitPullRequest size={14} stroke={1.8} />,
};

const TYPE_LABEL: Record<string, string> = {
  free_text: "Note",
  jira_ticket: "JIRA",
  github_pr: "PR",
};

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

export const PersonalNotes: React.FC<PersonalNotesProps> = ({
  notes,
  loading,
  onResolve,
  onDelete,
  onEdit,
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
        description="Add a note using the + button in the top bar."
      />
    );
  }

  const unresolved = notes.filter((n) => n.resolved === 0);
  const resolved = notes.filter((n) => n.resolved === 1);

  return (
    <div>
      {unresolved.length > 0 && (
        <Card className="mb-3">
          <Card.Body className="p-0">
            <div className="section-header px-3 pt-3 mb-0">
              <IconNote size={13} stroke={1.8} />
              <span>Unresolved</span>
              <Badge className="badge-status-yellow" style={{ fontSize: "0.625rem" }}>
                {unresolved.length}
              </Badge>
            </div>
            <div style={{ marginTop: 8 }}>
              {unresolved.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  jiraBaseUrl={jiraBaseUrl}
                  onResolve={onResolve}
                  onDelete={onDelete}
                  onEdit={onEdit}
                />
              ))}
            </div>
          </Card.Body>
        </Card>
      )}

      {resolved.length > 0 && (
        <Card>
          <Card.Body className="p-0">
            <div className="section-header px-3 pt-3 mb-0">
              <IconCheck size={13} stroke={1.8} />
              <span>Resolved</span>
              <Badge className="badge-status-green" style={{ fontSize: "0.625rem" }}>
                {resolved.length}
              </Badge>
            </div>
            <div style={{ marginTop: 8 }}>
              {resolved.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  jiraBaseUrl={jiraBaseUrl}
                  onResolve={onResolve}
                  onDelete={onDelete}
                  onEdit={onEdit}
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
  onEdit,
}: {
  note: Note;
  jiraBaseUrl: string;
  onResolve: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onEdit: (note: Note) => void;
}) {
  const url = getReferenceUrl(note, jiraBaseUrl);
  const title = note.type === "free_text" ? note.content : note.reference_id || "";
  const subtitle = note.type !== "free_text" && note.content ? note.content : "";

  return (
    <div className="summary-item d-flex align-items-center gap-3 px-3 py-2">
      <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
        {TYPE_ICON[note.type]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-truncate-custom d-block"
            style={{ fontWeight: 500, fontSize: "0.8125rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            {title}
          </a>
        ) : (
          <div className="text-truncate-custom" style={{ fontWeight: 500, fontSize: "0.8125rem" }}>
            {title}
          </div>
        )}
        {subtitle && (
          <div className="text-secondary-custom" style={{ fontSize: "0.75rem", marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>
      <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
        <Badge className="badge-status-neutral">{TYPE_LABEL[note.type]}</Badge>
        <span
          className="text-secondary-custom"
          style={{ fontSize: "0.6875rem", whiteSpace: "nowrap" }}
        >
          {formatRelativeTime(note.created_at)}
        </span>
        <Button
          variant="outline-secondary"
          size="sm"
          style={{ padding: "2px 6px" }}
          title="Edit"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(note);
          }}
        >
          <IconPencil size={12} />
        </Button>
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
            onDelete(note.id);
          }}
        >
          <IconTrash size={12} />
        </Button>
      </div>
    </div>
  );
}
