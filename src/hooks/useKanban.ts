import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  KanbanItem,
  KanbanTile,
  KanbanColumnId,
  KanbanItemType,
  GitHubPR,
  GitHubReviewRequest,
  Note,
} from "../types";
import { fetchKanbanItems, upsertKanbanItem, batchUpdateKanbanItems } from "../services/kanban";
import { getReferenceUrl, getNoteDisplayTitle } from "../utils/text";

export const KANBAN_COLUMNS: { id: KanbanColumnId; title: string; color: string }[] = [
  { id: "todo", title: "Todo", color: "badge-status-neutral" },
  { id: "in_progress", title: "In Progress", color: "badge-status-blue" },
  { id: "on_hold", title: "On Hold", color: "badge-status-yellow" },
  { id: "in_review", title: "In Review", color: "badge-status-purple" },
  { id: "done", title: "Done", color: "badge-status-green" },
];

interface UseKanbanProps {
  active: boolean;
  openPRs: GitHubPR[];
  reviewRequests: GitHubReviewRequest[];
  notes: Note[];
  jiraBaseUrl: string;
}

function makePrItemId(pr: GitHubPR): string {
  return `${pr.repo_full_name}#${pr.number}`;
}

export function useKanban({ active, openPRs, reviewRequests, notes, jiraBaseUrl }: UseKanbanProps) {
  const [kanbanItems, setKanbanItems] = useState<KanbanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const initialLoadDone = useRef(false);
  const populatingRef = useRef(false);

  // Build lookup maps from source data
  const prMap = useMemo(() => {
    const m = new Map<string, GitHubPR>();
    for (const pr of openPRs) m.set(makePrItemId(pr), pr);
    return m;
  }, [openPRs]);

  const reviewMap = useMemo(() => {
    const m = new Map<string, GitHubReviewRequest>();
    for (const r of reviewRequests) m.set(makePrItemId(r), r);
    return m;
  }, [reviewRequests]);

  const noteMap = useMemo(() => {
    const m = new Map<string, Note>();
    for (const n of notes) {
      if (n.type === "jira_ticket" || n.type === "github_pr") {
        m.set(String(n.id), n);
      }
    }
    return m;
  }, [notes]);

  // Load kanban items from backend
  const loadItems = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const items = await fetchKanbanItems();
      setKanbanItems(items);
      initialLoadDone.current = true;
    } catch {
      // silently ignore load errors
      initialLoadDone.current = true;
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Auto-populate: ensure all source items exist on the board
  // Runs after initial kanban load completes AND source data is available.
  // Track which source types have loaded (have data) to avoid marking items
  // as stale before their source data has arrived (race condition fix).
  const hasPRData = openPRs.length > 0;
  const hasReviewData = reviewRequests.length > 0;
  const hasNoteData = notes.length > 0;
  const hasSourceData = hasPRData || hasReviewData || hasNoteData;

  useEffect(() => {
    if (!active || !initialLoadDone.current || !hasSourceData || populatingRef.current) {
      return;
    }

    const existingKeys = new Set(kanbanItems.map((ki) => `${ki.item_type}:${ki.item_id}`));
    const toCreate: { item_type: KanbanItemType; item_id: string; column_name: KanbanColumnId }[] =
      [];

    // Open PRs -> in_progress
    for (const pr of openPRs) {
      const key = `pr:${makePrItemId(pr)}`;
      if (!existingKeys.has(key)) {
        toCreate.push({ item_type: "pr", item_id: makePrItemId(pr), column_name: "in_progress" });
      }
    }

    // Review requests -> in_review
    for (const r of reviewRequests) {
      const key = `review:${makePrItemId(r)}`;
      if (!existingKeys.has(key)) {
        toCreate.push({
          item_type: "review",
          item_id: makePrItemId(r),
          column_name: "in_review",
        });
      }
    }

    // Notes with JIRA/PR references -> todo
    for (const n of notes) {
      if (n.type === "jira_ticket" || n.type === "github_pr") {
        const key = `note:${String(n.id)}`;
        if (!existingKeys.has(key)) {
          toCreate.push({ item_type: "note", item_id: String(n.id), column_name: "todo" });
        }
      }
    }

    // Auto-move stale items: items on the board whose source data is gone.
    // Only check a given item type if that type's source data has loaded,
    // otherwise we'd incorrectly mark items as stale during a race condition
    // where one data source loads before another.
    const toMoveToDone: KanbanItem[] = [];
    for (const ki of kanbanItems) {
      if (ki.column_name === "done") continue;
      if (ki.item_type === "pr" && hasPRData && !prMap.has(ki.item_id)) {
        toMoveToDone.push(ki);
      } else if (ki.item_type === "review" && hasReviewData && !reviewMap.has(ki.item_id)) {
        toMoveToDone.push(ki);
      } else if (ki.item_type === "note" && hasNoteData && !noteMap.has(ki.item_id)) {
        toMoveToDone.push(ki);
      }
    }

    if (toCreate.length === 0 && toMoveToDone.length === 0) {
      return;
    }

    populatingRef.current = true;
    const promises: Promise<unknown>[] = [];

    for (const item of toCreate) {
      promises.push(
        upsertKanbanItem({
          item_type: item.item_type,
          item_id: item.item_id,
          column_name: item.column_name,
          position: 999,
        }),
      );
    }

    for (const ki of toMoveToDone) {
      promises.push(
        upsertKanbanItem({
          item_type: ki.item_type,
          item_id: ki.item_id,
          column_name: "done",
          position: 999,
        }),
      );
    }

    Promise.all(promises).then(() => {
      populatingRef.current = false;
      loadItems();
    });
  }, [
    active,
    hasSourceData,
    hasPRData,
    hasReviewData,
    hasNoteData,
    openPRs,
    reviewRequests,
    notes,
    kanbanItems,
    prMap,
    reviewMap,
    noteMap,
    loadItems,
  ]);

  // Hydrate a kanban item into a renderable tile
  const jiraBase = jiraBaseUrl?.replace(/\/+$/, "") || "";

  const hydrateTile = useCallback(
    (ki: KanbanItem): KanbanTile | null => {
      if (ki.item_type === "pr") {
        const pr = prMap.get(ki.item_id);
        return {
          kanbanItem: ki,
          pr,
          title: pr ? `#${pr.number} ${pr.title}` : ki.item_id,
          subtitle: pr?.repo_full_name ?? "",
          url: pr?.html_url ?? "",
          sourceBadge: "PR",
          sourceBadgeClass: "badge-status-green",
          checksStatus: pr?.checks_status,
          timestamp: pr?.updated_at ?? ki.updated_at,
        };
      }

      if (ki.item_type === "review") {
        const review = reviewMap.get(ki.item_id);
        return {
          kanbanItem: ki,
          review,
          title: review ? `#${review.number} ${review.title}` : ki.item_id,
          subtitle: review ? `${review.repo_full_name} · ${review.user.login}` : "",
          url: review?.html_url ?? "",
          sourceBadge: "Review",
          sourceBadgeClass: "badge-status-yellow",
          checksStatus: review?.checks_status,
          timestamp: review?.updated_at ?? ki.updated_at,
        };
      }

      if (ki.item_type === "note") {
        const note = noteMap.get(ki.item_id);
        if (!note) return null;
        const noteUrl = getReferenceUrl(note, jiraBase);
        const noteTitle = getNoteDisplayTitle(note);
        return {
          kanbanItem: ki,
          note,
          title: noteTitle,
          subtitle: note.content || "",
          url: noteUrl || "",
          sourceBadge: note.type === "jira_ticket" ? "JIRA" : "PR",
          sourceBadgeClass:
            note.type === "jira_ticket" ? "badge-status-blue" : "badge-status-green",
          timestamp: note.updated_at,
        };
      }

      return null;
    },
    [prMap, reviewMap, noteMap, jiraBase],
  );

  // Group tiles by column
  const columnTiles = useMemo(() => {
    const grouped: Record<KanbanColumnId, KanbanTile[]> = {
      todo: [],
      in_progress: [],
      on_hold: [],
      in_review: [],
      done: [],
    };
    for (const ki of kanbanItems) {
      const tile = hydrateTile(ki);
      if (tile) grouped[ki.column_name].push(tile);
    }
    for (const col of Object.keys(grouped) as KanbanColumnId[]) {
      grouped[col].sort((a, b) => a.kanbanItem.position - b.kanbanItem.position);
    }
    return grouped;
  }, [kanbanItems, hydrateTile]);

  // Move an item (drag-and-drop handler)
  const moveItem = useCallback(
    async (
      affectedItems: {
        item_type: string;
        item_id: string;
        column_name: string;
        position: number;
      }[],
    ) => {
      // Optimistic update
      setKanbanItems((prev) => {
        return prev.map((ki) => {
          const affected = affectedItems.find(
            (a) => a.item_type === ki.item_type && a.item_id === ki.item_id,
          );
          if (affected) {
            return {
              ...ki,
              column_name: affected.column_name as KanbanColumnId,
              position: affected.position,
            };
          }
          return ki;
        });
      });

      try {
        const updated = await batchUpdateKanbanItems(affectedItems);
        setKanbanItems(updated);
      } catch {
        // Rollback on failure
        const items = await fetchKanbanItems();
        setKanbanItems(items);
      }
    },
    [],
  );

  // Set of done item IDs for Summary filtering
  const doneItemIds = useMemo(() => {
    const set = new Set<string>();
    for (const ki of kanbanItems) {
      if (ki.column_name === "done") {
        set.add(`${ki.item_type}:${ki.item_id}`);
      }
    }
    return set;
  }, [kanbanItems]);

  return {
    columnTiles,
    loading,
    doneItemIds,
    moveItem,
    refresh: loadItems,
  };
}
