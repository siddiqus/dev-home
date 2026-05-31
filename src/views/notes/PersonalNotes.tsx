import React from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { Badge } from "../../components/primitives/Badge";
import { SectionHeader } from "../../components/primitives/SectionHeader";
import { IconNote, IconCheck, IconPlus } from "@tabler/icons-react";
import { Note } from "../../types";
import { EmptyState } from "../../components/EmptyState";
import { NoteRow } from "./NoteRow";
import "./notes.css";

interface PersonalNotesProps {
  notes: Note[];
  loading: boolean;
  onResolve: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onOpenNote: (note: Note) => void;
  onAdd: () => void;
  jiraBaseUrl: string;
}

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
