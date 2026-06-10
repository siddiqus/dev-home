import { useState, useCallback, useEffect, useRef } from "react";
import type { ClaudeSession, ClaudeAction } from "../types/claude";
import {
  fetchClaudeSessions,
  createClaudeSession,
  cancelClaudeSession,
  deleteClaudeSession,
} from "../services/claude";

interface UseClaudeSessionsReturn {
  sessions: ClaudeSession[];
  loading: boolean;
  error: string | null;
  activeCount: number;
  create: (opts: {
    prNumber: number;
    repoFullName: string;
    prTitle: string;
    action: ClaudeAction;
    customPrompt?: string;
  }) => Promise<string | null>;
  cancel: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useClaudeSessions(enabled: boolean): UseClaudeSessionsReturn {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await fetchClaudeSessions("all");
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setSessions([]);
      return;
    }

    setLoading(true);
    refresh().finally(() => setLoading(false));

    intervalRef.current = setInterval(refresh, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, refresh]);

  const create = useCallback(
    async (opts: {
      prNumber: number;
      repoFullName: string;
      prTitle: string;
      action: ClaudeAction;
      customPrompt?: string;
    }): Promise<string | null> => {
      try {
        const result = await createClaudeSession(opts);
        await refresh();
        return result.sessionId;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create session");
        return null;
      }
    },
    [refresh],
  );

  const cancel = useCallback(
    async (id: string) => {
      try {
        await cancelClaudeSession(id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to cancel session");
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteClaudeSession(id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete session");
      }
    },
    [refresh],
  );

  const activeCount = sessions.filter((s) => s.status === "running").length;

  return { sessions, loading, error, activeCount, create, cancel, remove, refresh };
}
