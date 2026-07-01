import React from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import { Badge } from "../../components/primitives/Badge";
import {
  IconNote,
  IconBrandJira,
  IconGitPullRequest,
  IconLink,
  IconCheck,
  IconTrash,
  IconPin,
  IconPinFilled,
} from "@tabler/icons-react";
import { Note } from "../../types";
import { getReferenceUrl, getNoteDisplayTitle } from "../../utils/text";
import { formatRelativeTime } from "../../utils/time";

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

interface NoteCardProps {
  note: Note;
  jiraBaseUrl: string;
  onResolve: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onPin: (id: number) => Promise<void>;
  onUnpin: (id: number) => Promise<void>;
  onOpenNote: (note: Note) => void;
}

export function NoteCard({
  note,
  jiraBaseUrl,
  onResolve,
  onDelete,
  onPin,
  onUnpin,
  onOpenNote,
}: NoteCardProps) {
  const url = getReferenceUrl(note, jiraBaseUrl);
  const title = getNoteDisplayTitle(note);
  const isPinned = note.pinned === 1;

  return (
    <Card className="note-card" style={{ cursor: "pointer" }} onClick={() => onOpenNote(note)}>
      <Card.Body className="d-flex flex-column p-3">
        <div className="d-flex align-items-center gap-2 mb-2">
          {isPinned && (
            <span
              className="d-flex align-items-center text-primary"
              style={{ flexShrink: 0 }}
              title="Pinned"
            >
              <IconPinFilled size={13} stroke={1.8} />
            </span>
          )}
          <span className="d-flex align-items-center" style={{ flexShrink: 0 }}>
            {TYPE_ICON[note.type]}
          </span>
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
        </div>

        <div
          className="text-secondary-custom note-content-truncate flex-grow-1"
          style={{ fontSize: "0.75rem" }}
        >
          {note.content || ""}
        </div>

        <div className="d-flex align-items-center gap-2 mt-auto pt-3">
          <Badge variant="neutral">{TYPE_LABEL[note.type]}</Badge>
          <span
            className="text-secondary-custom"
            style={{ fontSize: "0.6875rem", whiteSpace: "nowrap" }}
          >
            {formatRelativeTime(note.created_at)}
          </span>
          <div className="d-flex align-items-center gap-2 ms-auto" style={{ flexShrink: 0 }}>
            <Button
              variant={isPinned ? "primary" : "outline-secondary"}
              size="sm"
              style={{ padding: "2px 6px" }}
              title={isPinned ? "Unpin" : "Pin"}
              onClick={(e) => {
                e.stopPropagation();
                if (isPinned) {
                  onUnpin(note.id);
                } else {
                  onPin(note.id);
                }
              }}
            >
              {isPinned ? <IconPinFilled size={12} /> : <IconPin size={12} />}
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
                if (window.confirm("Are you sure you want to delete this note?")) {
                  onDelete(note.id);
                }
              }}
            >
              <IconTrash size={12} />
            </Button>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}
