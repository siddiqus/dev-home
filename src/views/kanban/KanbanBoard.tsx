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
import Spinner from "react-bootstrap/Spinner";
import { IconFilter } from "@tabler/icons-react";
import { KanbanTile, KanbanColumnId, KanbanItemType } from "../../types";
import type { ClaudeAction, ClaudeSession } from "../../types/claude";
import { KANBAN_COLUMNS } from "../../hooks/useKanban";
import { DescriptionModal } from "../../components/DescriptionModal";
import { SearchableDropdown, DropdownItem } from "../../components/SearchableDropdown";
import { getReferenceUrl } from "../../utils/text";
import { KanbanCard } from "./KanbanCard";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanSearch } from "./KanbanSearch";
import "./kanban.css";

const FILTER_ITEMS: DropdownItem[] = [
  { value: "pr", label: "My PRs" },
  { value: "review", label: "Reviews" },
  { value: "note", label: "Notes" },
];

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
  claudeEnabled?: boolean;
  claudeSessions?: ClaudeSession[];
  onClaudeAction?: (
    pr: {
      number: number;
      repo_full_name: string;
      title: string;
      headBranch: string;
      baseBranch: string;
    },
    action: ClaudeAction,
    customPrompt?: string,
  ) => void;
  onViewClaudeSession?: (sessionId: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  columnTiles,
  loading,
  jiraBaseUrl,
  onMoveItem,
  claudeEnabled,
  claudeSessions,
  onClaudeAction,
  onViewClaudeSession,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedTile, setSelectedTile] = useState<KanbanTile | null>(null);
  // Track which column the dragged item is currently over (for cross-column DnD)
  const [overColumnId, setOverColumnId] = useState<KanbanColumnId | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  // Filter tiles by search query and type
  const filteredColumnTiles = useMemo(() => {
    const hasSearch = searchQuery.trim().length > 0;
    const hasTypeFilter = typeFilter !== "";
    if (!hasSearch && !hasTypeFilter) return columnTiles;
    const q = searchQuery.toLowerCase();
    const filtered: Record<KanbanColumnId, KanbanTile[]> = {
      todo: [],
      in_progress: [],
      on_hold: [],
      in_review: [],
      done: [],
    };
    for (const col of Object.keys(columnTiles) as KanbanColumnId[]) {
      filtered[col] = columnTiles[col].filter((t) => {
        if (hasTypeFilter && t.kanbanItem.item_type !== typeFilter) return false;
        if (hasSearch) {
          return (
            t.title.toLowerCase().includes(q) ||
            t.subtitle.toLowerCase().includes(q) ||
            t.sourceBadge.toLowerCase().includes(q)
          );
        }
        return true;
      });
    }
    return filtered;
  }, [columnTiles, searchQuery, typeFilter]);

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
              : note.type === "free_text"
                ? "Note"
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
      <div className="kanban-toolbar">
        <KanbanSearch value={searchQuery} onChange={setSearchQuery} />
        <SearchableDropdown
          items={FILTER_ITEMS}
          value={typeFilter}
          onChange={setTypeFilter}
          placeholder="Filter type..."
          allLabel="All Types"
          width={140}
          triggerIcon={<IconFilter size={14} style={{ opacity: 0.5, flexShrink: 0 }} />}
        />
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
          {activeTile ? <KanbanCard tile={activeTile} isDragOverlay /> : null}
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
        pr={(selectedTile?.pr || selectedTile?.review) ?? undefined}
        claudeEnabled={claudeEnabled}
        activeSessions={
          selectedTile?.pr || selectedTile?.review
            ? claudeSessions?.filter((s) => {
                const tilePr = selectedTile.pr || selectedTile.review;
                return (
                  tilePr &&
                  s.prNumber === tilePr.number &&
                  s.repoFullName === tilePr.repo_full_name &&
                  s.status === "running"
                );
              })
            : undefined
        }
        onViewSession={onViewClaudeSession}
        onClaudeAction={
          (selectedTile?.pr || selectedTile?.review) && onClaudeAction
            ? (action, customPrompt) => {
                const tilePr = (selectedTile!.pr || selectedTile!.review)!;
                onClaudeAction(
                  {
                    number: tilePr.number,
                    repo_full_name: tilePr.repo_full_name,
                    title: tilePr.title,
                    headBranch: tilePr.head.ref,
                    baseBranch: tilePr.base.ref,
                  },
                  action,
                  customPrompt,
                );
              }
            : undefined
        }
      />
    </>
  );
};
