import { useMemo } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { BadgeVariant } from "../../components/primitives/Badge";
import { Badge } from "../../components/primitives/Badge";
import { KanbanTile, KanbanColumnId } from "../../types";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
  column: { id: KanbanColumnId; title: string; variant: BadgeVariant };
  tiles: KanbanTile[];
  onTileClick: (tile: KanbanTile) => void;
}

export function KanbanColumn({ column, tiles, onTileClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const sortableIds = useMemo(
    () => tiles.map((t) => `${t.kanbanItem.item_type}:${t.kanbanItem.item_id}`),
    [tiles],
  );

  return (
    <div ref={setNodeRef} className={`kanban-column ${isOver ? "kanban-column-over" : ""}`}>
      <div className="kanban-column-header">
        <span>{column.title}</span>
        <Badge variant={column.variant}>{String(tiles.length)}</Badge>
      </div>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="kanban-column-body">
          {tiles.map((tile) => (
            <KanbanCard
              key={`${tile.kanbanItem.item_type}:${tile.kanbanItem.item_id}`}
              tile={tile}
              onClick={() => onTileClick(tile)}
            />
          ))}
          {tiles.length === 0 && (
            <div
              className="text-secondary-custom"
              style={{ fontSize: "0.75rem", textAlign: "center", padding: "16px 8px" }}
            >
              No items
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
