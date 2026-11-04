import { useEffect, useMemo, useState } from "react";
import type { GitHubPR } from "../types";
import { mergedSince } from "../services/github";
import {
  EMPTY_EXTRAS,
  cachedWorkdaySince,
  cachedWorkdayStable,
  fetchWorkdaySince,
  fetchWorkdayStable,
  rememberWorkdaySince,
  rememberWorkdayStable,
  sprintParts,
  type AssignedIssues,
  type Part,
  type WorkdayExtras,
} from "../services/workday";

export interface WorkdayExtrasOptions {
  /** List or Standup is showing: load the done-since parts (Focus doesn't read them). */
  needsDone: boolean;
  /** The assigned-issues source; sprint and off-sprint are split from it, not fetched. */
  assigned?: AssignedIssues;
}

/**
 * Workday-only data, fetched while the Workday tab is mounted (lazy, like the
 * other self-fetching views). Gated on `configured` so it doesn't race the
 * credentials load; refetches when `refreshKey` bumps. Sprint data doesn't
 * depend on the lookback, so changing `since` only refetches the "done" parts.
 * Done tickets and reviewed PRs load only while List or Standup is showing (needsDone); Focus never reads them.
 * A group loaded in the last few minutes under the same refreshKey is reused,
 * so switching back to the tab shows it at once instead of refetching.
 */
export function useWorkdayExtras(
  configured: boolean,
  since: Date,
  refreshKey: number,
  opts: WorkdayExtrasOptions,
): WorkdayExtras {
  const { needsDone, assigned } = opts;
  const [extras, setExtras] = useState<WorkdayExtras>(() => ({
    ...EMPTY_EXTRAS,
    ...cachedWorkdayStable(refreshKey),
    ...cachedWorkdaySince(since, refreshKey),
  }));
  const sinceMs = since.getTime();

  useEffect(() => {
    if (!configured) return;
    const hit = cachedWorkdayStable(refreshKey);
    if (hit) {
      setExtras((prev) => ({ ...prev, ...hit }));
      return;
    }
    const ctrl = new AbortController();
    fetchWorkdayStable(refreshKey).then((res) => {
      if (ctrl.signal.aborted) return;
      rememberWorkdayStable(refreshKey, res);
      setExtras((prev) => ({ ...prev, ...res }));
    });
    return () => ctrl.abort();
  }, [configured, refreshKey]);

  useEffect(() => {
    if (!configured || !needsDone) return;
    const sinceDate = new Date(sinceMs);
    const hit = cachedWorkdaySince(sinceDate, refreshKey);
    if (hit) {
      setExtras((prev) => ({ ...prev, ...hit }));
      return;
    }
    const ctrl = new AbortController();
    setExtras((prev) => ({
      ...prev,
      doneTickets: EMPTY_EXTRAS.doneTickets,
      reviewed: EMPTY_EXTRAS.reviewed,
    }));
    fetchWorkdaySince(sinceDate, ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      rememberWorkdaySince(sinceDate, refreshKey, res);
      setExtras((prev) => ({ ...prev, ...res }));
    });
    return () => ctrl.abort();
  }, [configured, needsDone, sinceMs, refreshKey]);

  // Merged recently / Standup read my merged PRs since the lookback: a filter of
  // the ticket list, so they cost no request and follow a lookback change at once.
  // The ticket list keeps its last value through a refetch, so neither blinks out.
  const merged = useMemo<Part<GitHubPR[]>>(
    () =>
      extras.ticketMerged.data
        ? { data: mergedSince(extras.ticketMerged.data, new Date(sinceMs)), error: null }
        : extras.ticketMerged,
    [extras.ticketMerged, sinceMs],
  );
  const sprint = useMemo(() => sprintParts(assigned, new Date()), [assigned]);
  return useMemo(() => ({ ...extras, merged, ...sprint }), [extras, merged, sprint]);
}
