import { useEffect, useState } from "react";
import {
  EMPTY_EXTRAS,
  fetchWorkdaySince,
  fetchWorkdayStable,
  type WorkdayExtras,
} from "../services/workday";

/**
 * Workday-only data, fetched while the Workday tab is mounted (lazy, like the
 * other self-fetching views). Gated on `configured` so it doesn't race the
 * credentials load; refetches when `refreshKey` bumps. Sprint data doesn't
 * depend on the lookback, so changing `since` only refetches the "done" parts.
 */
export function useWorkdayExtras(
  configured: boolean,
  since: Date,
  refreshKey: number,
): WorkdayExtras {
  const [extras, setExtras] = useState<WorkdayExtras>(EMPTY_EXTRAS);
  const sinceMs = since.getTime();

  useEffect(() => {
    if (!configured) return;
    const ctrl = new AbortController();
    // `ticketMerged` keeps its last list until the refetch lands, so the deck's
    // merged rows don't blink out on every refresh.
    setExtras((prev) => ({
      ...prev,
      sprint: EMPTY_EXTRAS.sprint,
      offSprint: EMPTY_EXTRAS.offSprint,
    }));
    fetchWorkdayStable(ctrl.signal).then((res) => {
      if (!ctrl.signal.aborted) setExtras((prev) => ({ ...prev, ...res }));
    });
    return () => ctrl.abort();
  }, [configured, refreshKey]);

  useEffect(() => {
    if (!configured) return;
    const ctrl = new AbortController();
    setExtras((prev) => ({
      ...prev,
      doneTickets: EMPTY_EXTRAS.doneTickets,
      merged: EMPTY_EXTRAS.merged,
      reviewed: EMPTY_EXTRAS.reviewed,
    }));
    fetchWorkdaySince(new Date(sinceMs), ctrl.signal).then((res) => {
      if (!ctrl.signal.aborted) setExtras((prev) => ({ ...prev, ...res }));
    });
    return () => ctrl.abort();
  }, [configured, sinceMs, refreshKey]);

  return extras;
}
