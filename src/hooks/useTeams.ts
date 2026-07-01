import { useState, useEffect, useCallback } from "react";
import { fetchTeams } from "../services/teams";
import type { Team } from "../types/teams";

export function useTeams(active: boolean) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTeams()
      .then((t) => {
        if (!cancelled) setTeams(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load teams");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, refreshKey]);

  return { teams, loading, error, refresh };
}
