import React, { useMemo, useState } from "react";
import { Dropdown } from "react-bootstrap";
import type { KanbanTile, KanbanColumnId } from "../../types";
import { KANBAN_COLUMNS } from "../../hooks/useKanban";
import { Badge } from "../../components/primitives/Badge";

interface TaskPickerProps {
  columnTiles: KanbanTile[];
  selectedItemId: string | null;
  onSelect: (tile: KanbanTile | null) => void;
}

const COLUMN_TITLE: Record<KanbanColumnId, string> = KANBAN_COLUMNS.reduce(
  (acc, c) => {
    acc[c.id] = c.title;
    return acc;
  },
  {} as Record<KanbanColumnId, string>,
);

export const TaskPicker: React.FC<TaskPickerProps> = ({
  columnTiles,
  selectedItemId,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const byCol = new Map<KanbanColumnId, KanbanTile[]>();
    for (const tile of columnTiles) {
      const col = tile.kanbanItem.column_name;
      if (col === "done") continue;
      if (!byCol.has(col)) byCol.set(col, []);
      byCol.get(col)!.push(tile);
    }
    return KANBAN_COLUMNS.filter((c) => c.id !== "done")
      .map((c) => ({ column: c, tiles: byCol.get(c.id) ?? [] }))
      .filter((g) => g.tiles.length > 0);
  }, [columnTiles]);

  const selected = useMemo(
    () => columnTiles.find((t) => t.kanbanItem.item_id === selectedItemId) ?? null,
    [columnTiles, selectedItemId],
  );

  const triggerLabel = selected ? `Focus on: ${selected.title}` : "Focus on: (no specific task)";

  return (
    <Dropdown show={open} onToggle={(next) => setOpen(next)} className="pomodoro-task-picker">
      <Dropdown.Toggle variant="outline-secondary" size="sm" id="pomodoro-task-picker-toggle">
        {triggerLabel}
      </Dropdown.Toggle>
      <Dropdown.Menu className="pomodoro-task-picker-menu">
        <Dropdown.Item
          active={selectedItemId === null}
          onClick={() => {
            onSelect(null);
            setOpen(false);
          }}
        >
          (No specific task)
        </Dropdown.Item>
        {grouped.length === 0 && <Dropdown.Header>No tasks on board</Dropdown.Header>}
        {grouped.map(({ column, tiles }) => (
          <React.Fragment key={column.id}>
            <Dropdown.Divider />
            <Dropdown.Header>{COLUMN_TITLE[column.id]}</Dropdown.Header>
            {tiles.map((tile) => (
              <Dropdown.Item
                key={tile.kanbanItem.item_id}
                active={tile.kanbanItem.item_id === selectedItemId}
                onClick={() => {
                  onSelect(tile);
                  setOpen(false);
                }}
                className="pomodoro-task-picker-item"
              >
                <Badge variant={tile.sourceBadgeVariant} className="me-2">
                  {tile.sourceBadge}
                </Badge>
                <span>{tile.title}</span>
              </Dropdown.Item>
            ))}
          </React.Fragment>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
};
