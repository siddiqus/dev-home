import { useState, useEffect, useCallback } from "react";
import { fetchTeamDashboard } from "../services/teams";
import type { TeamDashboard } from "../types/teams";

export function useTeamDashboard(teamId: number | null, sprintId: number | null) {
  const [dashboard, setDashboard] = useState<TeamDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (teamId == null) {
      setDashboard(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTeamDashboard(teamId, sprintId)
      .then((d) => {
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
