import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KanbanTile,
  PomodoroPhase,
  PomodoroTaskSnapshot,
  PomodoroWorkMinutes,
  PomodoroPersistedState,
} from "../types";

const SHORT_BREAK_MIN = 5;
const LONG_BREAK_MIN = 15;
const CYCLES_BEFORE_LONG_BREAK = 4;
const DEFAULT_WORK_MIN: PomodoroWorkMinutes = 30;
const TICK_MS = 250;

const STORAGE_STATE_KEY = "dev-home-pomodoro-state";
const STORAGE_WORK_KEY = "dev-home-pomodoro-work-minutes";

const WORK_MINUTES_OPTIONS: PomodoroWorkMinutes[] = [15, 20, 30, 45];

function isWorkMinutes(n: unknown): n is PomodoroWorkMinutes {
  return typeof n === "number" && (WORK_MINUTES_OPTIONS as number[]).includes(n);
}

function phaseDurationMs(
  phase: PomodoroPhase,
  workMinutes: PomodoroWorkMinutes,
): number {
  switch (phase) {
    case "work":
      return workMinutes * 60_000;
    case "shortBreak":
      return SHORT_BREAK_MIN * 60_000;
    case "longBreak":
      return LONG_BREAK_MIN * 60_000;
    case "idle":
      return 0;
  }
}

function loadInitialState(): PomodoroPersistedState {
  const storedWork = Number(localStorage.getItem(STORAGE_WORK_KEY));
  const workMinutes: PomodoroWorkMinutes = isWorkMinutes(storedWork)
    ? storedWork
    : DEFAULT_WORK_MIN;

  const defaults: PomodoroPersistedState = {
    phase: "idle",
    cycleCount: 0,
    endsAt: null,
    remainingMs: 0,
    isRunning: false,
    workMinutes,
    selectedTaskSnapshot: null,
  };

  const raw = localStorage.getItem(STORAGE_STATE_KEY);
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as Partial<PomodoroPersistedState>;
    const merged: PomodoroPersistedState = {
      ...defaults,
      ...parsed,
      workMinutes: isWorkMinutes(parsed.workMinutes) ? parsed.workMinutes : workMinutes,
    };

    // If timer was running and endsAt has passed while app was closed,
    // treat phase as completed: advance, leave paused, no bell/notification.
    if (merged.isRunning && merged.endsAt !== null && merged.endsAt <= Date.now()) {
      const next = advancePhase(merged.phase, merged.cycleCount);
      return {
        ...merged,
        phase: next.phase,
        cycleCount: next.cycleCount,
        endsAt: null,
        remainingMs: phaseDurationMs(next.phase, merged.workMinutes),
        isRunning: false,
      };
    }

    // If running and endsAt still in future, recompute remainingMs.
    if (merged.isRunning && merged.endsAt !== null) {
      merged.remainingMs = Math.max(0, merged.endsAt - Date.now());
    }
    return merged;
  } catch {
    return defaults;
  }
}

function advancePhase(
  phase: PomodoroPhase,
  cycleCount: number,
): { phase: PomodoroPhase; cycleCount: number } {
  if (phase === "work") {
    const nextCount = cycleCount + 1;
    if (nextCount >= CYCLES_BEFORE_LONG_BREAK) {
      return { phase: "longBreak", cycleCount: nextCount };
    }
    return { phase: "shortBreak", cycleCount: nextCount };
  }
  if (phase === "longBreak") {
    return { phase: "work", cycleCount: 0 };
  }
  // shortBreak or idle → work
  return { phase: "work", cycleCount };
}

interface UsePomodoroProps {
  columnTiles: KanbanTile[];
}

export interface UsePomodoroReturn {
  phase: PomodoroPhase;
  workMinutes: PomodoroWorkMinutes;
  cycleCount: number;
  remainingMs: number;
  isRunning: boolean;
  selectedTaskSnapshot: PomodoroTaskSnapshot | null;
  selectedTaskOnBoard: boolean;
  workMinutesOptions: PomodoroWorkMinutes[];
  cyclesBeforeLongBreak: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  setWorkMinutes: (m: PomodoroWorkMinutes) => void;
  selectTask: (tile: KanbanTile | null) => void;
}

export function usePomodoro({ columnTiles }: UsePomodoroProps): UsePomodoroReturn {
  const [state, setState] = useState<PomodoroPersistedState>(loadInitialState);
  const intervalRef = useRef<number | null>(null);
  const bellRef = useRef<HTMLAudioElement | null>(null);

  // Lazily create audio element
  useEffect(() => {
    bellRef.current = new Audio("/pomodoro-bell.mp3");
    bellRef.current.preload = "auto";
  }, []);

  // Persist state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(state));
    localStorage.setItem(STORAGE_WORK_KEY, String(state.workMinutes));
  }, [state]);

  // Refresh selected task snapshot if the underlying tile data changes
  // (e.g. title edit). Don't auto-clear if tile disappears.
  useEffect(() => {
    if (!state.selectedTaskSnapshot) return;
    const tile = columnTiles.find(
      (t) => t.kanbanItem.item_id === state.selectedTaskSnapshot!.itemId,
    );
    if (!tile) return;
    const fresh: PomodoroTaskSnapshot = {
      itemId: tile.kanbanItem.item_id,
      title: tile.title,
      sourceBadge: tile.sourceBadge,
      sourceBadgeVariant: tile.sourceBadgeVariant,
      url: tile.url,
    };
    const prev = state.selectedTaskSnapshot;
    if (
      prev.title !== fresh.title ||
      prev.sourceBadge !== fresh.sourceBadge ||
      prev.sourceBadgeVariant !== fresh.sourceBadgeVariant ||
      prev.url !== fresh.url
    ) {
      setState((s) => ({ ...s, selectedTaskSnapshot: fresh }));
    }
  }, [columnTiles, state.selectedTaskSnapshot]);

  const selectedTaskOnBoard = useMemo(() => {
    if (!state.selectedTaskSnapshot) return false;
    return columnTiles.some(
      (t) =>
        t.kanbanItem.item_id === state.selectedTaskSnapshot!.itemId &&
        t.kanbanItem.column_name !== "done",
    );
  }, [columnTiles, state.selectedTaskSnapshot]);

  // End-of-phase handler
  const handlePhaseEnd = useCallback(() => {
    // Sound — swallow errors (autoplay policy etc.)
    try {
      bellRef.current?.play().catch(() => {});
    } catch {
      /* noop */
    }

    setState((s) => {
      const next = advancePhase(s.phase, s.cycleCount);
      const phaseLabel =
        s.phase === "work" ? "Work session complete" : "Break complete";
      const bodyLabel =
        next.phase === "work" ? "Time to focus" : "Time for a break";

      // Notification — swallow errors / permission denied
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(phaseLabel, { body: bodyLabel });
        }
      } catch {
        /* noop */
      }

      return {
        ...s,
        phase: next.phase,
        cycleCount: next.cycleCount,
        endsAt: null,
        remainingMs: phaseDurationMs(next.phase, s.workMinutes),
        isRunning: false,
      };
    });
  }, []);

  // Tick interval
  useEffect(() => {
    if (!state.isRunning || state.endsAt === null) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const tick = () => {
      const endsAt = state.endsAt;
      if (endsAt === null) return;
      const remaining = Math.max(0, endsAt - Date.now());
      if (remaining === 0) {
        handlePhaseEnd();
      } else {
        setState((s) =>
          s.isRunning && s.endsAt === endsAt ? { ...s, remainingMs: remaining } : s,
        );
      }
    };

    intervalRef.current = window.setInterval(tick, TICK_MS);
    tick();

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.isRunning, state.endsAt, handlePhaseEnd]);

  const start = useCallback(() => {
    setState((s) => {
      // Request notification permission on first user-initiated start
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        Notification.requestPermission().catch(() => {});
      }

      let phase = s.phase;
      let remainingMs = s.remainingMs;
      if (phase === "idle") {
        phase = "work";
        remainingMs = phaseDurationMs("work", s.workMinutes);
      } else if (remainingMs <= 0) {
        remainingMs = phaseDurationMs(phase, s.workMinutes);
      }
      return {
        ...s,
        phase,
        remainingMs,
        endsAt: Date.now() + remainingMs,
        isRunning: true,
      };
    });
  }, []);

  const pause = useCallback(() => {
    setState((s) => {
      if (!s.isRunning || s.endsAt === null) return s;
      const remainingMs = Math.max(0, s.endsAt - Date.now());
      return { ...s, isRunning: false, endsAt: null, remainingMs };
    });
  }, []);

  const reset = useCallback(() => {
    setState((s) => ({
      ...s,
      phase: "idle",
      cycleCount: 0,
      remainingMs: 0,
      endsAt: null,
      isRunning: false,
    }));
  }, []);

  const skip = useCallback(() => {
    setState((s) => {
      const next = advancePhase(s.phase === "idle" ? "work" : s.phase, s.cycleCount);
      return {
        ...s,
        phase: next.phase,
        cycleCount: next.cycleCount,
        endsAt: null,
        remainingMs: phaseDurationMs(next.phase, s.workMinutes),
        isRunning: false,
      };
    });
  }, []);

  const setWorkMinutes = useCallback((m: PomodoroWorkMinutes) => {
    setState((s) => {
      if (s.isRunning) return s; // ignore while running
      const remainingMs =
        s.phase === "work" || s.phase === "idle" ? phaseDurationMs("work", m) : s.remainingMs;
      return { ...s, workMinutes: m, remainingMs };
    });
  }, []);

  const selectTask = useCallback((tile: KanbanTile | null) => {
    setState((s) => {
      if (!tile) return { ...s, selectedTaskSnapshot: null };
      const snap: PomodoroTaskSnapshot = {
        itemId: tile.kanbanItem.item_id,
        title: tile.title,
        sourceBadge: tile.sourceBadge,
        sourceBadgeVariant: tile.sourceBadgeVariant,
        url: tile.url,
      };
      return { ...s, selectedTaskSnapshot: snap };
    });
  }, []);

  return {
    phase: state.phase,
    workMinutes: state.workMinutes,
    cycleCount: state.cycleCount,
    remainingMs: state.remainingMs,
    isRunning: state.isRunning,
    selectedTaskSnapshot: state.selectedTaskSnapshot,
    selectedTaskOnBoard,
    workMinutesOptions: WORK_MINUTES_OPTIONS,
    cyclesBeforeLongBreak: CYCLES_BEFORE_LONG_BREAK,
    start,
    pause,
    reset,
    skip,
    setWorkMinutes,
    selectTask,
  };
}
