import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchFocusState,
  setPin as apiSetPin,
  setSnooze as apiSetSnooze,
  type FocusStateItem,
} from "../services/focusApi";
import { mergeSources, scoreItems, type FocusItem, type RankedFocusItem } from "../services/focus";
import type { GitHubPR, JiraIssue, JiraComment, GitHubComment, Note } from "../types";

interface UseFocusArgs {
  active: boolean;
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  jiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  notes: Note[]; // pass unresolvedNotes
}

type PendingMutation =
  | { kind: "pin"; itemId: string; pinned: boolean }
  | { kind: "snooze"; itemId: string; until: number | null };

export interface FocusGroups {
  pinned: RankedFocusItem[];
  topPriority: RankedFocusItem[];
  rest: RankedFocusItem[];
  snoozed: FocusItem[];
}

const TOP_N = 5;

export function useFocus(args: UseFocusArgs) {
  const [stateByItem, setStateByItem] = useState<Record<string, FocusStateItem>>({});
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const pending = useRef<PendingMutation[]>([]);

  const load = useCallback(async () => {
    if (!args.active) return;
    setLoading(true);
    try {
      const items = await fetchFocusState();
      const map: Record<string, FocusStateItem> = {};
      for (const it of items) map[it.itemId] = it;
      setStateByItem(map);
      setOffline(false);

      // Replay any queued mutations now that we're back online
      const queued = pending.current.splice(0);
      for (const m of queued) {
        if (m.kind === "pin") await apiSetPin(m.itemId, m.pinned);
        else await apiSetSnooze(m.itemId, m.until);
      }
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [args.active]);

  useEffect(() => {
    load();
  }, [load]);

  const baseItems = useMemo<FocusItem[]>(
    () =>
      mergeSources({
        openPRs: args.openPRs,
        reviewRequests: args.reviewRequests,
        jiraIssues: args.jiraIssues,
        jiraComments: args.jiraComments,
        githubMentions: args.githubMentions,
        notes: args.notes,
      }),
    [
      args.openPRs,
      args.reviewRequests,
      args.jiraIssues,
      args.jiraComments,
      args.githubMentions,
      args.notes,
    ],
  );

  const itemsWithState = useMemo<FocusItem[]>(() => {
    return baseItems.map((i) => {
      const s = stateByItem[i.id];
      if (!s) return i;
      return {
        ...i,
        signals: {
          ...i.signals,
          isPinned: s.pinnedAt != null,
          snoozedUntil: s.snoozedUntil ?? undefined,
        },
      };
    });
  }, [baseItems, stateByItem]);

  const groups = useMemo<FocusGroups>(() => {
    const now = Date.now();
    const ranked = scoreItems(itemsWithState, now);
    const pinned = ranked.filter((i) => i.signals.isPinned);
    const unpinned = ranked.filter((i) => !i.signals.isPinned);
    const topPriority = unpinned.slice(0, TOP_N);
    const rest = unpinned.slice(TOP_N);
    const snoozed = itemsWithState.filter(
      (i) => i.signals.snoozedUntil && i.signals.snoozedUntil > now,
    );
    return { pinned, topPriority, rest, snoozed };
  }, [itemsWithState]);

  const optimisticPatch = useCallback((itemId: string, patch: Partial<FocusStateItem>) => {
    setStateByItem((prev) => ({
      ...prev,
      [itemId]: {
        itemId,
        pinnedAt: prev[itemId]?.pinnedAt ?? null,
        snoozedUntil: prev[itemId]?.snoozedUntil ?? null,
        ...patch,
      },
    }));
  }, []);

  const pin = useCallback(
    async (itemId: string, pinned: boolean) => {
      optimisticPatch(itemId, { pinnedAt: pinned ? Date.now() : null });
      try {
        await apiSetPin(itemId, pinned);
        setOffline(false);
      } catch {
        setOffline(true);
        pending.current.push({ kind: "pin", itemId, pinned });
      }
    },
    [optimisticPatch],
  );

  const snooze = useCallback(
    async (itemId: string, until: number | null) => {
      optimisticPatch(itemId, { snoozedUntil: until });
      try {
        await apiSetSnooze(itemId, until);
        setOffline(false);
      } catch {
        setOffline(true);
        pending.current.push({ kind: "snooze", itemId, until });
      }
    },
    [optimisticPatch],
  );

  return {
    groups,
    loading,
    offline,
    pin,
    snooze,
    refresh: load,
  };
}
