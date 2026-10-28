import { useEffect, useState } from "react";
import {
  EMPTY_EXTRAS,
  cachedWorkdaySince,
  cachedWorkdayStable,
  fetchWorkdaySince,
  fetchWorkdayStable,
  rememberWorkdaySince,
  rememberWorkdayStable,
  type WorkdayExtras,
} from "../services/workday";

/**
 * Workday-only data, fetched while the Workday tab is mounted (lazy, like the
 * other self-fetching views). Gated on `configured` so it doesn't race the
 * credentials load; refetches when `refreshKey` bumps. Sprint data doesn't
 * depend on the lookback, so changing `since` only refetches the "done" parts.
 * A group loaded in the last few minutes under the same refreshKey is reused,
 * so switching back to the tab shows it at once instead of refetching.
 */
export function useWorkdayExtras(
  configured: boolean,
  since: Date,
  refreshKey: number,
): WorkdayExtras {
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
    // `ticketMerged` keeps its last list until the refetch lands, so the deck's
    // merged rows don't blink out on every refresh.
    setExtras((prev) => ({
      ...prev,
      sprint: EMPTY_EXTRAS.sprint,
      offSprint: EMPTY_EXTRAS.offSprint,
    }));
    fetchWorkdayStable(ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      rememberWorkdayStable(refreshKey, res);
      setExtras((prev) => ({ ...prev, ...res }));
    });
    return () => ctrl.abort();
  }, [configured, refreshKey]);

  useEffect(() => {
    if (!configured) return;
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
      merged: EMPTY_EXTRAS.merged,
      reviewed: EMPTY_EXTRAS.reviewed,
    }));
    fetchWorkdaySince(sinceDate, ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      rememberWorkdaySince(sinceDate, refreshKey, res);
      setExtras((prev) => ({ ...prev, ...res }));
    });
    return () => ctrl.abort();
  }, [configured, sinceMs, refreshKey]);

  return extras;
}
