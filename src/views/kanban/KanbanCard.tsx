import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { KanbanTile } from "../../types";
import { Badge } from "../../components/primitives/Badge";
import { ChecksStatusIcon } from "../../components/ChecksStatusIcon";
import { formatRelativeTime } from "../../utils/time";

interface KanbanCardProps {
  tile: KanbanTile;
  isDragOverlay?: boolean;
  onClick?: () => void;
}

export function KanbanCard({ tile, isDragOverlay, onClick }: KanbanCardProps) {
  const tileId = `${tile.kanbanItem.item_type}:${tile.kanbanItem.item_id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tileId,
    data: { tile },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!onClick) return;
    // Don't open modal if user clicked a link
    const target = e.target as HTMLElement;
    if (target.tagName === "A" || target.closest("a")) return;
    onClick();
  };

  return (
    <div
      ref={!isDragOverlay ? setNodeRef : undefined}
      style={!isDragOverlay ? style : undefined}
      className={`kanban-tile ${isDragOverlay ? "kanban-tile-overlay" : ""}`}
      {...(!isDragOverlay ? { ...attributes, ...listeners } : {})}
      onClick={!isDragOverlay ? handleClick : undefined}
    >
      <div className="d-flex justify-content-between align-items-start mb-1">
        {tile.url ? (
          <a
            href={tile.url}
            target="_blank"
            rel="noopener noreferrer"
            className="kanban-tile-title"
            onClick={(e) => e.stopPropagation()}
          >
            {tile.title}
          </a>
        ) : (
          <span className="kanban-tile-title">{tile.title}</span>
        )}
        <span
          style={{ fontSize: "0.625rem", flexShrink: 0, marginLeft: 6, display: "inline-flex" }}
        >
          <Badge variant={tile.sourceBadgeVariant}>{tile.sourceBadge}</Badge>
        </span>
      </div>
      {tile.subtitle && <div className="kanban-tile-subtitle">{tile.subtitle}</div>}
      <div className="d-flex align-items-center gap-2 mt-1">
        <ChecksStatusIcon status={tile.checksStatus ?? null} />
        <span className="text-secondary-custom" style={{ fontSize: "0.6875rem" }}>
          {formatRelativeTime(tile.timestamp)}
        </span>
      </div>
    </div>
  );
}
