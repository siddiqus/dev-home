import React, { useState } from "react";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { Badge } from "../../components/primitives/Badge";
import { SectionHeader } from "../../components/primitives/SectionHeader";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { IconNote, IconCheck, IconPlus, IconPinFilled } from "@tabler/icons-react";
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

  const pinned = notes.filter((n) => n.pinned === 1);
  const unresolved = notes.filter((n) => n.pinned !== 1 && n.resolved === 0);
  const resolved = notes.filter((n) => n.pinned !== 1 && n.resolved === 1);

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
      <div className="d-flex justify-content-end mb-2">
        <Button variant="outline-secondary" size="sm" onClick={onAdd}>
          <IconPlus size={14} className="me-1" />
          Add Note
        </Button>
      </div>
      {pinned.length > 0 && (
        <div className="mb-3">
          <SectionHeader className="mb-2">
            <IconPinFilled size={13} stroke={1.8} />
            <span>Pinned</span>
            <Badge variant="neutral">{pinned.length}</Badge>
          </SectionHeader>
          {renderGrid(pinned)}
        </div>
      )}

      <SegmentedTabs
        className="mb-3"
        tabs={[
          { key: "unresolved", label: `Unresolved (${unresolved.length})` },
          { key: "resolved", label: `Resolved (${resolved.length})` },
        ]}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as "unresolved" | "resolved")}
      />

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
