import React, { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import { KanbanTile, KanbanColumnId } from "../types";
import { KANBAN_COLUMNS } from "../hooks/useKanban";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { DescriptionModal } from "./DescriptionModal";
import { formatRelativeTime } from "../utils/time";
import { getReferenceUrl } from "../utils/text";
import { IconSearch, IconX } from "@tabler/icons-react";

// ─── Tile Card ───────────────────────────────────────────────

interface TileCardProps {
  tile: KanbanTile;
  isDragOverlay?: boolean;
  onClick?: () => void;
}

function KanbanTileCard({ tile, isDragOverlay, onClick }: TileCardProps) {
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
        <Badge
          className={tile.sourceBadgeClass}
          style={{ fontSize: "0.625rem", flexShrink: 0, marginLeft: 6 }}
        >
          {tile.sourceBadge}
        </Badge>
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

// ─── Column ──────────────────────────────────────────────────

interface ColumnProps {
  column: { id: KanbanColumnId; title: string; color: string };
  tiles: KanbanTile[];
  onTileClick: (tile: KanbanTile) => void;
}

function KanbanColumn({ column, tiles, onTileClick }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const sortableIds = useMemo(
    () => tiles.map((t) => `${t.kanbanItem.item_type}:${t.kanbanItem.item_id}`),
    [tiles],
  );

  return (
    <div ref={setNodeRef} className={`kanban-column ${isOver ? "kanban-column-over" : ""}`}>
      <div className="kanban-column-header">
        <span>{column.title}</span>
        <Badge className={column.color}>{tiles.length}</Badge>
      </div>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="kanban-column-body">
          {tiles.map((tile) => (
            <KanbanTileCard
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

// ─── Custom collision detection ──────────────────────────────
// Prefer pointerWithin for tiles, fall back to rectIntersection
// for columns. This makes cross-column drops much easier.
const kanbanCollision: CollisionDetection = (args) => {
  // First check if pointer is within any droppable
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  // Fall back to rect intersection (more forgiving)
  return rectIntersection(args);
};

// ─── Board ───────────────────────────────────────────────────

interface KanbanBoardProps {
  columnTiles: Record<KanbanColumnId, KanbanTile[]>;
  loading: boolean;
  jiraBaseUrl?: string;
  onMoveItem: (
    affectedItems: {
      item_type: string;
      item_id: string;
      column_name: string;
      position: number;
    }[],
  ) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  columnTiles,
  loading,
  jiraBaseUrl,
  onMoveItem,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTile, setSelectedTile] = useState<KanbanTile | null>(null);
  // Track which column the dragged item is currently over (for cross-column DnD)
  const [overColumnId, setOverColumnId] = useState<KanbanColumnId | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  // Filter tiles by search query
  const filteredColumnTiles = useMemo(() => {
    if (!searchQuery.trim()) return columnTiles;
    const q = searchQuery.toLowerCase();
    const filtered: Record<KanbanColumnId, KanbanTile[]> = {
      todo: [],
      in_progress: [],
      on_hold: [],
      in_review: [],
      done: [],
    };
    for (const col of Object.keys(columnTiles) as KanbanColumnId[]) {
      filtered[col] = columnTiles[col].filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.subtitle.toLowerCase().includes(q) ||
          t.sourceBadge.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [columnTiles, searchQuery]);

  // Find the currently-dragged tile for the overlay
  const activeTile = useMemo(() => {
    if (!activeId) return null;
    for (const tiles of Object.values(columnTiles)) {
      const found = tiles.find(
        (t) => `${t.kanbanItem.item_type}:${t.kanbanItem.item_id}` === activeId,
      );
      if (found) return found;
    }
    return null;
  }, [activeId, columnTiles]);

  function findColumn(tileId: string): KanbanColumnId | null {
    // Check if it's a column id directly
    if (KANBAN_COLUMNS.some((c) => c.id === tileId)) {
      return tileId as KanbanColumnId;
    }
    // Otherwise find which column contains this tile
    for (const [colId, tiles] of Object.entries(columnTiles)) {
      if (tiles.some((t) => `${t.kanbanItem.item_type}:${t.kanbanItem.item_id}` === tileId)) {
        return colId as KanbanColumnId;
      }
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    if (!over) {
      setOverColumnId(null);
      return;
    }
    const overId = over.id as string;
    // Determine which column the pointer is over
    const col = findColumn(overId);
    setOverColumnId(col);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverColumnId(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    const sourceCol = findColumn(activeIdStr);
    // Use overColumnId (tracked during drag) as preferred destination
    let destCol = overColumnId || findColumn(overIdStr);

    if (!sourceCol || !destCol) return;

    // Build new column arrays
    const sourceTiles = [...columnTiles[sourceCol]];
    const activeTileIndex = sourceTiles.findIndex(
      (t) => `${t.kanbanItem.item_type}:${t.kanbanItem.item_id}` === activeIdStr,
    );
    if (activeTileIndex === -1) return;

    const movedTile = sourceTiles[activeTileIndex];

    if (sourceCol === destCol) {
      // Reorder within the same column
      const overTileIndex = sourceTiles.findIndex(
        (t) => `${t.kanbanItem.item_type}:${t.kanbanItem.item_id}` === overIdStr,
      );
      if (overTileIndex === -1 || activeTileIndex === overTileIndex) return;

      // Remove and reinsert
      sourceTiles.splice(activeTileIndex, 1);
      sourceTiles.splice(overTileIndex, 0, movedTile);

      // Build affected items with new positions
      const affectedItems = sourceTiles.map((t, i) => ({
        item_type: t.kanbanItem.item_type,
        item_id: t.kanbanItem.item_id,
        column_name: sourceCol,
        position: i,
      }));

      onMoveItem(affectedItems);
    } else {
      // Move between columns
      sourceTiles.splice(activeTileIndex, 1);

      const destTiles = [...columnTiles[destCol]];

      // Find insertion index: if dropping onto a tile, insert at that position
      let insertIndex = destTiles.length;
      if (overIdStr !== destCol) {
        const overIndex = destTiles.findIndex(
          (t) => `${t.kanbanItem.item_type}:${t.kanbanItem.item_id}` === overIdStr,
        );
        if (overIndex !== -1) insertIndex = overIndex;
      }

      destTiles.splice(insertIndex, 0, movedTile);

      // Recalculate positions for both columns
      const affectedItems = [
        ...sourceTiles.map((t, i) => ({
          item_type: t.kanbanItem.item_type,
          item_id: t.kanbanItem.item_id,
          column_name: sourceCol,
          position: i,
        })),
        ...destTiles.map((t, i) => ({
          item_type: t.kanbanItem.item_type,
          item_id: t.kanbanItem.item_id,
          column_name: destCol!,
          position: i,
        })),
      ];

      onMoveItem(affectedItems);
    }
  }

  // Build modal data from selected tile
  const jiraBase = jiraBaseUrl?.replace(/\/+$/, "") || "";

  const modalData = useMemo(() => {
    if (!selectedTile) return null;
    const { kanbanItem, pr, review, note } = selectedTile;

    if (kanbanItem.item_type === "pr" && pr) {
      return {
        title: `#${pr.number} ${pr.title}`,
        subtitle: pr.repo_full_name,
        description: pr.body || "",
        url: pr.html_url,
        checks: pr.checks,
      };
    }

    if (kanbanItem.item_type === "review" && review) {
      return {
        title: `#${review.number} ${review.title}`,
        subtitle: `${review.repo_full_name} · ${review.user.login}`,
        description: review.body || "",
        url: review.html_url,
        checks: review.checks,
      };
    }

    if (kanbanItem.item_type === "note" && note) {
      return {
        title: selectedTile.title,
        subtitle:
          note.type === "jira_ticket"
            ? "JIRA Ticket"
            : note.type === "github_pr"
              ? "GitHub PR"
              : "Link",
        description: note.content || "",
        url: getReferenceUrl(note, jiraBase) || undefined,
      };
    }

    return null;
  }, [selectedTile, jiraBase]);

  const handleTileClick = useCallback((tile: KanbanTile) => {
    setSelectedTile(tile);
  }, []);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  return (
    <>
      {/* Search bar */}
      <div className="kanban-search-wrapper">
        <IconSearch size={14} className="kanban-search-icon" />
        <input
          type="text"
          className="kanban-search-input"
          placeholder="Search tiles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="kanban-search-clear" onClick={() => setSearchQuery("")}>
            <IconX size={14} />
          </button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={kanbanCollision}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban-board">
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              tiles={filteredColumnTiles[col.id]}
              onTileClick={handleTileClick}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTile ? <KanbanTileCard tile={activeTile} isDragOverlay /> : null}
        </DragOverlay>
      </DndContext>

      <DescriptionModal
        show={!!selectedTile}
        onHide={() => setSelectedTile(null)}
        title={modalData?.title || ""}
        subtitle={modalData?.subtitle}
        description={modalData?.description || ""}
        url={modalData?.url}
        checks={modalData?.checks}
      />
    </>
  );
};
