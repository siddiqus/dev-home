import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FocusableItem,
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

const wholeSeconds = (ms: number) => Math.ceil(ms / 1000);

const STORAGE_STATE_KEY = "dev-home-pomodoro-state";
const STORAGE_WORK_KEY = "dev-home-pomodoro-work-minutes";

const WORK_MINUTES_OPTIONS: PomodoroWorkMinutes[] = [15, 20, 30, 45];

function isWorkMinutes(n: unknown): n is PomodoroWorkMinutes {
  return typeof n === "number" && (WORK_MINUTES_OPTIONS as number[]).includes(n);
}

function phaseDurationMs(phase: PomodoroPhase, workMinutes: PomodoroWorkMinutes): number {
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
  focusableItems: FocusableItem[];
}

export interface UsePomodoroReturn {
  phase: PomodoroPhase;
  workMinutes: PomodoroWorkMinutes;
  cycleCount: number;
  remainingMs: number;
  isRunning: boolean;
  selectedTaskSnapshot: PomodoroTaskSnapshot | null;
  selectedTaskAvailable: boolean;
  workMinutesOptions: PomodoroWorkMinutes[];
  cyclesBeforeLongBreak: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  setWorkMinutes: (m: PomodoroWorkMinutes) => void;
  selectTask: (item: FocusableItem | null) => void;
}

export function usePomodoro({ focusableItems }: UsePomodoroProps): UsePomodoroReturn {
  const [state, setState] = useState<PomodoroPersistedState>(loadInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const bellRef = useRef<HTMLAudioElement | null>(null);

  // Lazily create audio element
  useEffect(() => {
    const audio = new Audio("/pomodoro-bell.m4a");
    audio.preload = "auto";
    bellRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
      bellRef.current = null;
    };
  }, []);

  // Persist state changes. While running, endsAt is the source of truth and
  // remainingMs is recomputed on load, so countdown ticks aren't written.
  const persisted = useMemo(
    () => JSON.stringify(state.isRunning ? { ...state, remainingMs: 0 } : state),
    [state],
  );
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_STATE_KEY, persisted);
      localStorage.setItem(STORAGE_WORK_KEY, String(state.workMinutes));
    } catch {
      /* swallow storage errors (quota exceeded, blocked, etc.) */
    }
  }, [persisted, state.workMinutes]);

  // Refresh selected task snapshot if the underlying source data changes
  // (e.g. title edit). Don't auto-clear if the item disappears.
  useEffect(() => {
    const snap = state.selectedTaskSnapshot;
    if (!snap) return;
    const item = focusableItems.find(
      (i) => i.id === snap.itemId && (snap.group ? i.group === snap.group : true),
    );
    if (!item) return;
    const fresh: PomodoroTaskSnapshot = {
      itemId: item.id,
      group: item.group,
      title: item.title,
      sourceBadge: item.sourceBadge,
      sourceBadgeVariant: item.sourceBadgeVariant,
      url: item.url,
    };
    if (
      snap.title !== fresh.title ||
      snap.group !== fresh.group ||
      snap.sourceBadge !== fresh.sourceBadge ||
      snap.sourceBadgeVariant !== fresh.sourceBadgeVariant ||
      snap.url !== fresh.url
    ) {
      setState((s) => ({ ...s, selectedTaskSnapshot: fresh }));
    }
  }, [focusableItems, state.selectedTaskSnapshot]);

  const selectedTaskAvailable = useMemo(() => {
    const snap = state.selectedTaskSnapshot;
    if (!snap) return false;
    return focusableItems.some(
      (i) => i.id === snap.itemId && (snap.group ? i.group === snap.group : true),
    );
  }, [focusableItems, state.selectedTaskSnapshot]);

  // End-of-phase handler. Side effects (bell, notification) run here, outside
  // the state updater, so they fire once even when React replays updaters.
  const handlePhaseEnd = useCallback(() => {
    const current = stateRef.current;
    const next = advancePhase(current.phase, current.cycleCount);

    // Sound — swallow errors (autoplay policy etc.)
    try {
      bellRef.current?.play().catch(() => {});
    } catch {
      /* noop */
    }
    // Notification — swallow errors / permission denied
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(current.phase === "work" ? "Work session complete" : "Break complete", {
          body: next.phase === "work" ? "Time to focus" : "Time for a break",
        });
      }
    } catch {
      /* noop */
    }

    setState((s) => {
      const advanced = advancePhase(s.phase, s.cycleCount);
      return {
        ...s,
        phase: advanced.phase,
        cycleCount: advanced.cycleCount,
        endsAt: null,
        remainingMs: phaseDurationMs(advanced.phase, s.workMinutes),
        isRunning: false,
      };
    });
  }, []);

  // While running: end the phase exactly at endsAt, and update the countdown
  // only when its displayed second changes (not every tick).
  useEffect(() => {
    const endsAt = state.endsAt;
    if (!state.isRunning || endsAt === null) return;

    const tick = () => {
      const remaining = Math.max(0, endsAt - Date.now());
      setState((s) =>
        s.isRunning &&
        s.endsAt === endsAt &&
        wholeSeconds(s.remainingMs) !== wholeSeconds(remaining)
          ? { ...s, remainingMs: remaining }
          : s,
      );
    };
    const interval = window.setInterval(tick, TICK_MS);
    const timeout = window.setTimeout(handlePhaseEnd, Math.max(0, endsAt - Date.now()));
    tick();

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [state.isRunning, state.endsAt, handlePhaseEnd]);

  const start = useCallback(() => {
    // Request notification permission on first user-initiated start
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    setState((s) => {
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

  const selectTask = useCallback((item: FocusableItem | null) => {
    setState((s) => {
      if (!item) return { ...s, selectedTaskSnapshot: null };
      const snap: PomodoroTaskSnapshot = {
        itemId: item.id,
        group: item.group,
        title: item.title,
        sourceBadge: item.sourceBadge,
        sourceBadgeVariant: item.sourceBadgeVariant,
        url: item.url,
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
    selectedTaskAvailable,
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
