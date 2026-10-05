import { useState, useEffect, useRef, useCallback } from "react";
import { fetchTeamDashboard } from "../services/teams";
import type { TeamDashboard } from "../types/teams";

export function useTeamDashboard(teamId: number | null, sprintId: number | null) {
  const [dashboard, setDashboard] = useState<TeamDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Tracks the team the current `dashboard` belongs to, so we can distinguish a
  // team switch (drop the stale data) from a sprint switch (keep the panels).
  const loadedTeamId = useRef<number | null>(null);

  const seenRefreshKey = useRef(refreshKey);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (teamId == null) {
      setDashboard(null);
      loadedTeamId.current = null;
      return;
    }
    let cancelled = false;
    // On a team switch, clear the previous team's data immediately so the view
    // doesn't render stale panels behind the loading overlay. A sprint switch
    // within the same team keeps the panels and just refetches in place.
    if (teamId !== loadedTeamId.current) {
      setDashboard(null);
    }
    // An explicit refresh also reloads the board's (cached) sprint list.
    const force = refreshKey !== seenRefreshKey.current;
    seenRefreshKey.current = refreshKey;
    setLoading(true);
    setError(null);
    fetchTeamDashboard(teamId, sprintId, { force })
      .then((d) => {
        if (!cancelled) {
          setDashboard(d);
          loadedTeamId.current = teamId;
        }
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
