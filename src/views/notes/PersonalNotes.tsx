import React, { useState } from "react";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { IconNote, IconCheck, IconPlus } from "@tabler/icons-react";
import { Note } from "../../types";
import { EmptyState } from "../../components/EmptyState";
import { NoteCard } from "./NoteCard";
import "./notes.css";

interface PersonalNotesProps {
  notes: Note[];
  loading: boolean;
  onResolve: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onPin: (id: number) => Promise<void>;
  onUnpin: (id: number) => Promise<void>;
  onOpenNote: (note: Note) => void;
  onAdd: () => void;
  jiraBaseUrl: string;
}

export const PersonalNotes: React.FC<PersonalNotesProps> = ({
  notes,
  loading,
  onResolve,
  onDelete,
  onPin,
  onUnpin,
  onOpenNote,
  onAdd,
  jiraBaseUrl,
}) => {
  const [activeTab, setActiveTab] = useState<"unresolved" | "resolved">("unresolved");

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

  // Pinned notes float to the front, then newest-first within each group.
  const sortPinnedFirst = (items: Note[]) =>
    [...items].sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned - a.pinned;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const unresolved = sortPinnedFirst(notes.filter((n) => n.resolved === 0));
  const resolved = sortPinnedFirst(notes.filter((n) => n.resolved === 1));

  const activeNotes = activeTab === "unresolved" ? unresolved : resolved;

  const renderGrid = (items: Note[]) => (
    <div className="row g-3">
      {items.map((note) => (
        <div key={note.id} className="col-md-3">
          <NoteCard
            note={note}
            jiraBaseUrl={jiraBaseUrl}
            onResolve={onResolve}
            onDelete={onDelete}
            onPin={onPin}
            onUnpin={onUnpin}
            onOpenNote={onOpenNote}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <SegmentedTabs
          className="mb-0"
          tabs={[
            { key: "unresolved", label: `Unresolved (${unresolved.length})` },
            { key: "resolved", label: `Resolved (${resolved.length})` },
          ]}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as "unresolved" | "resolved")}
        />
        <Button variant="outline-secondary" size="sm" onClick={onAdd}>
          <IconPlus size={14} className="me-1" />
          Add Note
        </Button>
      </div>

      {activeNotes.length === 0 ? (
        <EmptyState
          icon={
            activeTab === "unresolved" ? (
              <IconNote size={48} stroke={1} />
            ) : (
              <IconCheck size={48} stroke={1} />
            )
          }
          title={activeTab === "unresolved" ? "No unresolved notes" : "No resolved notes"}
          description={
            activeTab === "unresolved"
              ? "You're all caught up."
              : "Resolved notes will appear here."
          }
        />
      ) : (
        renderGrid(activeNotes)
      )}
    </div>
  );
};
