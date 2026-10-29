import { useState, useEffect, useRef, useCallback } from "react";
import { cacheTeamDashboard, fetchTeamDashboard, readCachedTeamDashboard } from "../services/teams";
import type { TeamDashboard } from "../types/teams";

/**
 * The sprint cockpit's data for a team + sprint. A dashboard loaded before is
 * served from the browser cache with no request (it survives page reloads);
 * only `refresh` goes back to the network. While a load is in flight the
 * dashboard is null, so the view shows its placeholder instead of stale cards.
 */
export function useTeamDashboard(teamId: number | null, sprintId: number | null) {
  const [dashboard, setDashboard] = useState<TeamDashboard | null>(() =>
    teamId != null ? readCachedTeamDashboard(teamId, sprintId) : null,
  );
  // Start out loading when there's nothing cached, so the first paint is the
  // placeholder rather than an empty page.
  const [loading, setLoading] = useState(() => teamId != null && dashboard == null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const seenRefreshKey = useRef(refreshKey);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    setError(null);
    if (teamId == null) {
      setDashboard(null);
      setLoading(false);
      return;
    }
    // An explicit refresh skips the cache and also reloads the board's sprint list.
    const force = refreshKey !== seenRefreshKey.current;
    seenRefreshKey.current = refreshKey;
    if (!force) {
      const cached = readCachedTeamDashboard(teamId, sprintId);
      if (cached) {
        setDashboard(cached);
        setLoading(false);
        return;
      }
    }

    let cancelled = false;
    setDashboard(null);
    setLoading(true);
    fetchTeamDashboard(teamId, sprintId, { force })
      .then((d) => {
        // Worth keeping even if the user has moved on; they may come back.
        cacheTeamDashboard(teamId, sprintId, d);
        if (!cancelled) setDashboard(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, sprintId, refreshKey]);

  return { dashboard, loading, error, refresh };
}
