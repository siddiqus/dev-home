import { useEffect, useMemo, useRef, useState } from "react";
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
  /** Standup is showing: load the done-since parts (Focus and List don't read them). */
  needsDone: boolean;
  /** The assigned-issues source; sprint and off-sprint are split from it, not fetched. */
  assigned?: AssignedIssues;
  /** useDashboard().pollKey: a bump while mounted refetches quietly (no loading state). */
  pollKey?: number;
}

/**
 * Workday-only data, fetched while the Workday tab is mounted (lazy, like the
 * other self-fetching views). Gated on `configured` so it doesn't race the
 * credentials load. Sprint data doesn't depend on the lookback, so changing
 * `since` only refetches the "done" parts. Done tickets and reviewed PRs load
 * only while Standup is showing (needsDone); Focus and List never read them.
 * A group loaded under the same refreshKey is reused however old it is, so
 * opening the tab never refetches. It reloads when refreshKey bumps (Refresh,
 * a merge) and, quietly, when pollKey bumps (the polling interval) while open.
 */
export function useWorkdayExtras(
  configured: boolean,
  since: Date,
  refreshKey: number,
  opts: WorkdayExtrasOptions,
): WorkdayExtras {
  const { needsDone, assigned, pollKey = 0 } = opts;
  // The pollKey each effect last ran under: a change means the interval fired
  // while mounted, so refetch past the cache and keep showing the old data.
  const stablePoll = useRef(pollKey);
  const sincePoll = useRef(pollKey);
  const [extras, setExtras] = useState<WorkdayExtras>(() => ({
    ...EMPTY_EXTRAS,
    ...cachedWorkdayStable(refreshKey),
    ...cachedWorkdaySince(since, refreshKey),
  }));
  const sinceMs = since.getTime();

  useEffect(() => {
    if (!configured) return;
    const polled = stablePoll.current !== pollKey;
    stablePoll.current = pollKey;
    const hit = polled ? null : cachedWorkdayStable(refreshKey);
    if (hit) {
      setExtras((prev) => ({ ...prev, ...hit }));
      return;
    }
    const ctrl = new AbortController();
    fetchWorkdayStable(refreshKey, new Date(), { force: polled }).then((res) => {
      if (ctrl.signal.aborted) return;
      rememberWorkdayStable(refreshKey, res);
      // A failed polling refetch keeps what's on screen rather than an error.
      if (polled && res.ticketMerged.error) return;
      setExtras((prev) => ({ ...prev, ...res }));
    });
    return () => ctrl.abort();
  }, [configured, refreshKey, pollKey]);

  useEffect(() => {
    if (!configured || !needsDone) return;
    const polled = sincePoll.current !== pollKey;
    sincePoll.current = pollKey;
    const sinceDate = new Date(sinceMs);
    const hit = polled ? null : cachedWorkdaySince(sinceDate, refreshKey);
    if (hit) {
      setExtras((prev) => ({ ...prev, ...hit }));
      return;
    }
    const ctrl = new AbortController();
    // A polling refetch keeps the old lists up until the new ones land.
    if (!polled) {
      setExtras((prev) => ({
        ...prev,
        doneTickets: EMPTY_EXTRAS.doneTickets,
        reviewed: EMPTY_EXTRAS.reviewed,
      }));
    }
    fetchWorkdaySince(sinceDate, ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      rememberWorkdaySince(sinceDate, refreshKey, res);
      if (polled && (res.doneTickets.error || res.reviewed.error)) return;
      setExtras((prev) => ({ ...prev, ...res }));
    });
    return () => ctrl.abort();
  }, [configured, needsDone, sinceMs, refreshKey, pollKey]);

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
