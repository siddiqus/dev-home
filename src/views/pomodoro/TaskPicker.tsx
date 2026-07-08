import React, { useMemo, useState, useEffect, useRef } from "react";
import Modal from "react-bootstrap/Modal";
import { IconCheck, IconListSearch } from "@tabler/icons-react";
import type { FocusableItem, FocusableGroup } from "../../types";
import { Badge } from "../../components/primitives/Badge";
import { EmptyState } from "../../components/EmptyState";
import { SearchInput } from "../../components/SearchInput";

interface TaskPickerProps {
  items: FocusableItem[];
  selectedItemId: string | null;
  onSelect: (item: FocusableItem | null) => void;
  renderTrigger: (props: { open: () => void }) => React.ReactNode;
}

const GROUP_ORDER: FocusableGroup[] = ["prs", "reviews", "jira", "mentions", "notes"];

const GROUP_TITLE: Record<FocusableGroup, string> = {
  prs: "My Pull Requests",
  reviews: "Review Requests",
  jira: "JIRA Tasks",
  mentions: "Mentions",
  notes: "Notes",
};

export const TaskPicker: React.FC<TaskPickerProps> = ({
  items,
  selectedItemId,
  onSelect,
  renderTrigger,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byGroup = new Map<FocusableGroup, FocusableItem[]>();
    for (const item of items) {
      if (q && !item.title.toLowerCase().includes(q)) continue;
      if (!byGroup.has(item.group)) byGroup.set(item.group, []);
      byGroup.get(item.group)!.push(item);
    }
    return GROUP_ORDER.map((g) => ({ group: g, items: byGroup.get(g) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [items, query]);

  const handlePick = (item: FocusableItem | null) => {
    onSelect(item);
    setOpen(false);
  };

  return (
    <>
      {renderTrigger({ open: () => setOpen(true) })}

      <Modal
        show={open}
        onHide={() => setOpen(false)}
        centered
        size="lg"
        onEntered={() => searchInputRef.current?.focus()}
        dialogClassName="pomodoro-task-picker-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title as="h5">Focus on a task</Modal.Title>
        </Modal.Header>
        <Modal.Body className="pomodoro-task-picker-body">
          <SearchInput
            ref={searchInputRef}
            value={query}
            onChange={setQuery}
            placeholder="Search tasks…"
          />

          <button
            type="button"
            className={
              "pomodoro-task-option pomodoro-task-option--none" +
              (selectedItemId === null ? " is-selected" : "")
            }
            onClick={() => handlePick(null)}
          >
            <span className="pomodoro-task-option-title">No specific task</span>
            {selectedItemId === null && <IconCheck size={16} />}
          </button>

          {grouped.length === 0 && (
            <EmptyState
              icon={<IconListSearch size={48} />}
              title={query ? "No matching tasks" : "Nothing to focus on yet"}
              description={
                query
                  ? "Try a different search term to find a task to focus on."
                  : "Tasks from your PRs, reviews, JIRA, and notes will appear here."
              }
            />
          )}

          {grouped.map(({ group, items: groupItems }) => (
            <section key={group} className="pomodoro-task-group">
              <header className="pomodoro-task-group-header">
                <span>{GROUP_TITLE[group]}</span>
                <span className="pomodoro-task-group-count">{groupItems.length}</span>
              </header>
              <ul className="pomodoro-task-list">
                {groupItems.map((item) => {
                  const isSelected = item.id === selectedItemId;
                  return (
                    <li key={`${item.group}:${item.id}`}>
                      <button
                        type="button"
                        className={"pomodoro-task-option" + (isSelected ? " is-selected" : "")}
                        onClick={() => handlePick(item)}
                      >
                        <Badge
                          variant={item.sourceBadgeVariant}
                          className="pomodoro-task-option-badge"
                        >
                          {item.sourceBadge}
                        </Badge>
                        <span className="pomodoro-task-option-title">{item.title}</span>
                        {isSelected && (
                          <IconCheck size={16} className="pomodoro-task-option-check" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </Modal.Body>
      </Modal>
    </>
  );
};
