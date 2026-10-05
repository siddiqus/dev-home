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
import type { BadgeVariant } from "../components/primitives/Badge";
import { fetchKanbanItems, upsertKanbanItem, batchUpdateKanbanItems } from "../services/kanban";
import { getReferenceUrl, getNoteDisplayTitle } from "../utils/text";
import { prNoteKey } from "../utils/prNotes";

export const KANBAN_COLUMNS: { id: KanbanColumnId; title: string; variant: BadgeVariant }[] = [
  { id: "todo", title: "Todo", variant: "neutral" },
  { id: "in_progress", title: "In Progress", variant: "info" },
  { id: "on_hold", title: "On Hold", variant: "warning" },
  { id: "in_review", title: "In Review", variant: "purple" },
  { id: "done", title: "Done", variant: "success" },
];

interface UseKanbanProps {
  active: boolean;
  openPRs: GitHubPR[];
  reviewRequests: GitHubReviewRequest[];
  notes: Note[];
  /**
   * Whether each source has completed a real load. Stale-item detection waits
   * on these: cache-seeded or not-yet-fetched lists can't prove an item gone,
   * and a genuinely empty list must still count as loaded.
   */
  prsLoaded: boolean;
  reviewsLoaded: boolean;
  notesLoaded: boolean;
  jiraBaseUrl: string;
  onResolveNote?: (id: number) => Promise<void>;
  onUnresolveNote?: (id: number) => Promise<void>;
}

const makePrItemId = prNoteKey;

export function useKanban({
  active,
  openPRs,
  reviewRequests,
  notes,
  prsLoaded,
  reviewsLoaded,
  notesLoaded,
  jiraBaseUrl,
  onResolveNote,
  onUnresolveNote,
}: UseKanbanProps) {
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
      m.set(String(n.id), n);
    }
    return m;
  }, [notes]);

  // Load kanban items from backend. Returns whether the load succeeded so the
  // caller can decide whether to retry.
  //
  // IMPORTANT: initialLoadDone is set ONLY on success. A failed read must not
  // unlock auto-populate below — otherwise it diffs live sources (PRs/reviews/
  // notes, which are seeded from cache and non-empty immediately on refresh)
  // against an empty board and re-creates every item, producing a storm of
  // POST /api/kanban calls and resetting manual column placement to defaults.
  const loadItems = useCallback(async (): Promise<boolean> => {
    if (!active) return false;
    setLoading(true);
    try {
      const items = await fetchKanbanItems();
      setKanbanItems(items);
      initialLoadDone.current = true;
      return true;
    } catch {
      // Leave initialLoadDone false so auto-populate stays gated on a real load.
      return false;
    } finally {
      setLoading(false);
    }
  }, [active]);

  // Initial load with bounded retry. A transient failure (e.g. the backend /
  // dynamic API port not ready on a fresh app reload) must not leave the board
  // unloaded, since auto-populate only runs after a successful load.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const ok = await loadItems();
      if (ok || cancelled || attempt >= 5) return;
      attempt += 1;
      retry = setTimeout(run, Math.min(1000 * attempt, 5000));
    };
    run();
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [active, loadItems]);

  // Auto-populate: ensure all source items exist on the board
  // Runs after initial kanban load completes AND source data is available.
  // Items are only marked stale once their source has really loaded (race
  // condition fix).
  const hasPRData = prsLoaded;
  const hasReviewData = reviewsLoaded;
  const hasNoteData = notesLoaded;
  const hasSourceData =
    hasPRData ||
    hasReviewData ||
    hasNoteData ||
    openPRs.length > 0 ||
    reviewRequests.length > 0 ||
    notes.length > 0;

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

    // Notes -> todo
    for (const n of notes) {
      const key = `note:${String(n.id)}`;
      if (!existingKeys.has(key)) {
        toCreate.push({ item_type: "note", item_id: String(n.id), column_name: "todo" });
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

    Promise.all(promises)
      .catch(() => {})
      .finally(() => {
        // Always release the guard, or one failed upsert stops auto-populate for good.
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
          sourceBadgeVariant: "success",
          checksStatus: pr?.checks_status,
          optionalChecksFailing: pr?.optional_checks_failing,
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
          sourceBadgeVariant: "warning",
          checksStatus: review?.checks_status,
          optionalChecksFailing: review?.optional_checks_failing,
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
          sourceBadge:
            note.type === "jira_ticket"
              ? "JIRA"
              : note.type === "github_pr"
                ? "PR"
                : note.type === "free_text"
                  ? "Note"
                  : "Link",
          sourceBadgeVariant:
            note.type === "jira_ticket"
              ? "info"
              : note.type === "github_pr"
                ? "success"
                : note.type === "free_text"
                  ? "purple"
                  : "neutral",
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
      // Capture which notes are currently in "done" before the update
      const prevDoneNoteIds = new Set(
        kanbanItems
          .filter((ki) => ki.item_type === "note" && ki.column_name === "done")
          .map((ki) => ki.item_id),
      );

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

      // Auto-resolve/unresolve notes moved to/from the done column
      for (const item of affectedItems) {
        if (item.item_type !== "note") continue;
        if (item.column_name === "done" && onResolveNote) {
          onResolveNote(Number(item.item_id)).catch(() => {});
        } else if (
          item.column_name !== "done" &&
          prevDoneNoteIds.has(item.item_id) &&
          onUnresolveNote
        ) {
          onUnresolveNote(Number(item.item_id)).catch(() => {});
        }
      }
    },
    [kanbanItems, onResolveNote, onUnresolveNote],
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
