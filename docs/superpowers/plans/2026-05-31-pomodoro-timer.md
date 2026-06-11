# Pomodoro Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Pomodoro focus timer tab with a top-bar badge, configurable work duration presets (15/20/30/45), and the ability to pin a task from the Kanban board.

**Architecture:** A single `usePomodoro` hook lifted in `App.tsx` owns all timer state, driven by a wall-clock `endsAt` timestamp + 250ms `setInterval` for accuracy under throttling. Two presentational components consume it: `PomodoroView` (tab content) and `PomodoroBadge` (top bar). Task picker pulls from existing `columnTiles` produced by `useKanban`. State persists to `localStorage`.

**Tech Stack:** React 18, TypeScript, react-bootstrap, @tabler/icons-react, Electron (renderer Notification API), Vite. No test framework in repo — verification is manual.

**Spec:** [docs/superpowers/specs/2026-05-31-pomodoro-timer-design.md](../specs/2026-05-31-pomodoro-timer-design.md)

---

## Parallelization Map

Tasks 1–3 are file-isolated and can be dispatched as **parallel agents**:
- **Task 1** — types + hook (`src/hooks/usePomodoro.ts`, edits to `src/types.ts`)
- **Task 2** — `TaskPicker` (`src/views/pomodoro/TaskPicker.tsx` + part of `pomodoro.css`)
- **Task 3** — bell asset + CSS scaffold (`public/pomodoro-bell.mp3`, `src/views/pomodoro/pomodoro.css`)

Tasks 4–6 depend on 1–3 and must run sequentially:
- **Task 4** — `PomodoroBadge` (depends on Task 1 types)
- **Task 5** — `PomodoroView` (depends on Tasks 1, 2, 3)
- **Task 6** — wire into `App.tsx` (depends on Tasks 1, 4, 5)
- **Task 7** — manual verification pass

---

## Task 1: Pomodoro types + `usePomodoro` hook

**Files:**
- Modify: `src/types.ts` (add Pomodoro types at the end)
- Create: `src/hooks/usePomodoro.ts`

**Dependencies:** none — can run in parallel with Tasks 2 and 3.

- [ ] **Step 1: Add types to `src/types.ts`**

Append to the bottom of `src/types.ts`:

```ts
// ---------------- Pomodoro ----------------

export type PomodoroPhase = "idle" | "work" | "shortBreak" | "longBreak";
export type PomodoroWorkMinutes = 15 | 20 | 30 | 45;

export interface PomodoroTaskSnapshot {
  itemId: string;
  title: string;
  sourceBadge: string;
  sourceBadgeVariant: "info" | "success" | "warning" | "danger" | "purple" | "neutral";
  url: string;
}

export interface PomodoroPersistedState {
  phase: PomodoroPhase;
  cycleCount: number;
  endsAt: number | null;
  remainingMs: number;
  isRunning: boolean;
  workMinutes: PomodoroWorkMinutes;
  selectedTaskSnapshot: PomodoroTaskSnapshot | null;
}
```

- [ ] **Step 2: Create `src/hooks/usePomodoro.ts`**

Create the file with the full hook implementation:

```ts
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
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/sabbir.siddiqui/Documents/work/cmp/dev-home && yarn build`
Expected: TypeScript compilation succeeds. (Build will run vite afterward but that's fine.) If `yarn build` is too heavy, run `yarn tsc --noEmit` instead.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/hooks/usePomodoro.ts
git commit -m "feat(pomodoro): add types and usePomodoro hook"
```

---

## Task 2: TaskPicker component

**Files:**
- Create: `src/views/pomodoro/TaskPicker.tsx`

**Dependencies:** none for the picker itself — can run in parallel with Tasks 1 and 3. The picker only uses existing primitives and types that already exist in the repo. CSS will be added in Task 3.

- [ ] **Step 1: Create `src/views/pomodoro/TaskPicker.tsx`**

```tsx
import React, { useMemo, useState } from "react";
import { Dropdown } from "react-bootstrap";
import type { KanbanTile, KanbanColumnId } from "../../types";
import { KANBAN_COLUMNS } from "../../hooks/useKanban";
import { Badge } from "../../components/primitives/Badge";

interface TaskPickerProps {
  columnTiles: KanbanTile[];
  selectedItemId: string | null;
  onSelect: (tile: KanbanTile | null) => void;
}

const COLUMN_TITLE: Record<KanbanColumnId, string> = KANBAN_COLUMNS.reduce(
  (acc, c) => {
    acc[c.id] = c.title;
    return acc;
  },
  {} as Record<KanbanColumnId, string>,
);

export const TaskPicker: React.FC<TaskPickerProps> = ({
  columnTiles,
  selectedItemId,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const byCol = new Map<KanbanColumnId, KanbanTile[]>();
    for (const tile of columnTiles) {
      const col = tile.kanbanItem.column_name;
      if (col === "done") continue;
      if (!byCol.has(col)) byCol.set(col, []);
      byCol.get(col)!.push(tile);
    }
    // Return in KANBAN_COLUMNS order
    return KANBAN_COLUMNS.filter((c) => c.id !== "done")
      .map((c) => ({ column: c, tiles: byCol.get(c.id) ?? [] }))
      .filter((g) => g.tiles.length > 0);
  }, [columnTiles]);

  const selected = useMemo(
    () => columnTiles.find((t) => t.kanbanItem.item_id === selectedItemId) ?? null,
    [columnTiles, selectedItemId],
  );

  const triggerLabel = selected
    ? `Focus on: ${selected.title}`
    : "Focus on: (no specific task)";

  return (
    <Dropdown show={open} onToggle={(next) => setOpen(next)} className="pomodoro-task-picker">
      <Dropdown.Toggle variant="outline-secondary" size="sm" id="pomodoro-task-picker-toggle">
        {triggerLabel}
      </Dropdown.Toggle>
      <Dropdown.Menu className="pomodoro-task-picker-menu">
        <Dropdown.Item
          onClick={() => {
            onSelect(null);
            setOpen(false);
          }}
        >
          (No specific task)
        </Dropdown.Item>
        {grouped.length === 0 && (
          <Dropdown.Header>No tasks on board</Dropdown.Header>
        )}
        {grouped.map(({ column, tiles }) => (
          <React.Fragment key={column.id}>
            <Dropdown.Divider />
            <Dropdown.Header>{COLUMN_TITLE[column.id]}</Dropdown.Header>
            {tiles.map((tile) => (
              <Dropdown.Item
                key={tile.kanbanItem.item_id}
                onClick={() => {
                  onSelect(tile);
                  setOpen(false);
                }}
                className="pomodoro-task-picker-item"
              >
                <Badge variant={tile.sourceBadgeVariant} className="me-2">
                  {tile.sourceBadge}
                </Badge>
                <span>{tile.title}</span>
              </Dropdown.Item>
            ))}
          </React.Fragment>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/sabbir.siddiqui/Documents/work/cmp/dev-home && yarn tsc --noEmit`
Expected: PASS — no TypeScript errors.

Note: this component references `pomodoro-task-picker*` CSS classes that will be defined in Task 3 / 5. Type-check is what matters at this step.

- [ ] **Step 3: Commit**

```bash
git add src/views/pomodoro/TaskPicker.tsx
git commit -m "feat(pomodoro): add TaskPicker component for selecting kanban tile"
```

---

## Task 3: Bell sound asset + CSS scaffold

**Files:**
- Create: `public/pomodoro-bell.mp3`
- Create: `src/views/pomodoro/pomodoro.css`

**Dependencies:** none — can run in parallel with Tasks 1 and 2.

- [ ] **Step 1: Add bell sound to `public/`**

Source a small (<50KB), royalty-free bell/chime mp3. Acceptable sources:
- Freesound.org "bell" search filtered to CC0 license
- Or use macOS bundled sound: `cp /System/Library/Sounds/Glass.aiff /tmp/glass.aiff && ffmpeg -i /tmp/glass.aiff /Users/sabbir.siddiqui/Documents/work/cmp/dev-home/public/pomodoro-bell.mp3` (requires ffmpeg)

If ffmpeg is unavailable, ask the user to drop a bell mp3 at `public/pomodoro-bell.mp3` before continuing.

Verify the file exists:
```bash
ls -la /Users/sabbir.siddiqui/Documents/work/cmp/dev-home/public/pomodoro-bell.mp3
```
Expected: file present, size between 5KB and 100KB.

- [ ] **Step 2: Create `src/views/pomodoro/pomodoro.css`**

All values use design tokens from `src/styles/tokens.css`. No hard-coded colors.

```css
/* Pomodoro view styles */

.pomodoro-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  padding: 1.5rem 1rem;
  max-width: 540px;
  margin: 0 auto;
}

.pomodoro-task-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.pomodoro-active-task {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-primary);
}

.pomodoro-active-task--missing {
  opacity: 0.7;
  font-style: italic;
}

.pomodoro-active-task-clear {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0 0.25rem;
  font-size: 0.875rem;
  line-height: 1;
}

.pomodoro-active-task-clear:hover {
  color: var(--color-text-primary);
}

.pomodoro-timer-display {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: clamp(3rem, 12vw, 6rem);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
  line-height: 1;
}

.pomodoro-phase-label {
  font-size: 1rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.pomodoro-cycle-indicator {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.pomodoro-presets {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.pomodoro-preset-btn {
  min-width: 3rem;
}

.pomodoro-controls {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

/* Task picker */

.pomodoro-task-picker .dropdown-toggle {
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pomodoro-task-picker-menu {
  max-height: 320px;
  overflow-y: auto;
  min-width: 280px;
}

.pomodoro-task-picker-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: normal;
}

/* Top bar badge */

.pomodoro-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-primary);
  background: none;
  border: 1px solid var(--color-border-default);
  border-radius: 0.25rem;
  padding: 0.125rem 0.5rem;
  cursor: pointer;
  line-height: 1.4;
}

.pomodoro-badge:hover {
  background: var(--color-bg-hover);
}
```

- [ ] **Step 3: Verify CSS file exists and is valid**

Run: `ls -la /Users/sabbir.siddiqui/Documents/work/cmp/dev-home/src/views/pomodoro/pomodoro.css`
Expected: file present.

Also verify the design tokens referenced exist:
```bash
grep -E "(--color-text-primary|--color-text-muted|--color-border-default|--color-bg-hover)" /Users/sabbir.siddiqui/Documents/work/cmp/dev-home/src/styles/tokens.css
```
Expected: each token name appears at least once. If `--color-bg-hover` is missing, replace it in `pomodoro.css` with the nearest equivalent (check tokens.css for sidebar hover or button hover tokens) — do not invent a new token here.

- [ ] **Step 4: Commit**

```bash
git add public/pomodoro-bell.mp3 src/views/pomodoro/pomodoro.css
git commit -m "feat(pomodoro): add bell sound asset and view styles"
```

---

## Task 4: PomodoroBadge component

**Files:**
- Create: `src/views/pomodoro/PomodoroBadge.tsx`

**Dependencies:** Task 1 (types), Task 3 (CSS class `.pomodoro-badge`).

- [ ] **Step 1: Create `src/views/pomodoro/PomodoroBadge.tsx`**

```tsx
import React from "react";
import { StatusDot, type StatusDotVariant } from "../../components/primitives/StatusDot";
import type { PomodoroPhase } from "../../types";
import "./pomodoro.css";

interface PomodoroBadgeProps {
  phase: PomodoroPhase;
  remainingMs: number;
  taskTitle: string | null;
  onClick: () => void;
}

function formatMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function phaseVariant(phase: PomodoroPhase): StatusDotVariant {
  switch (phase) {
    case "work":
      return "warning";
    case "shortBreak":
    case "longBreak":
      return "success";
    case "idle":
      return "neutral";
  }
}

function phaseLabel(phase: PomodoroPhase): string {
  switch (phase) {
    case "work":
      return "Work";
    case "shortBreak":
      return "Short break";
    case "longBreak":
      return "Long break";
    case "idle":
      return "Idle";
  }
}

export const PomodoroBadge: React.FC<PomodoroBadgeProps> = ({
  phase,
  remainingMs,
  taskTitle,
  onClick,
}) => {
  const tooltip = taskTitle
    ? `${phaseLabel(phase)} · ${taskTitle}`
    : `${phaseLabel(phase)} · ${formatMmSs(remainingMs)} remaining`;
  return (
    <button
      type="button"
      className="pomodoro-badge"
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
    >
      <StatusDot variant={phaseVariant(phase)} />
      <span>{formatMmSs(remainingMs)}</span>
    </button>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/sabbir.siddiqui/Documents/work/cmp/dev-home && yarn tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/views/pomodoro/PomodoroBadge.tsx
git commit -m "feat(pomodoro): add PomodoroBadge for top bar"
```

---

## Task 5: PomodoroView component

**Files:**
- Create: `src/views/pomodoro/PomodoroView.tsx`

**Dependencies:** Tasks 1, 2, 3.

- [ ] **Step 1: Create `src/views/pomodoro/PomodoroView.tsx`**

```tsx
import React from "react";
import { Button, ButtonGroup } from "react-bootstrap";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconRotateClockwise,
  IconPlayerTrackNextFilled,
  IconX,
} from "@tabler/icons-react";
import type { KanbanTile, PomodoroPhase, PomodoroWorkMinutes } from "../../types";
import { Badge } from "../../components/primitives/Badge";
import { TaskPicker } from "./TaskPicker";
import "./pomodoro.css";

interface PomodoroViewProps {
  columnTiles: KanbanTile[];
  phase: PomodoroPhase;
  workMinutes: PomodoroWorkMinutes;
  cycleCount: number;
  remainingMs: number;
  isRunning: boolean;
  selectedTaskSnapshot: import("../../types").PomodoroTaskSnapshot | null;
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

function formatMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function phaseLabel(phase: PomodoroPhase): string {
  switch (phase) {
    case "work":
      return "Work";
    case "shortBreak":
      return "Short break";
    case "longBreak":
      return "Long break";
    case "idle":
      return "Ready";
  }
}

export const PomodoroView: React.FC<PomodoroViewProps> = ({
  columnTiles,
  phase,
  workMinutes,
  cycleCount,
  remainingMs,
  isRunning,
  selectedTaskSnapshot,
  selectedTaskOnBoard,
  workMinutesOptions,
  cyclesBeforeLongBreak,
  start,
  pause,
  reset,
  skip,
  setWorkMinutes,
  selectTask,
}) => {
  const displayMs =
    phase === "idle" && remainingMs === 0 ? workMinutes * 60_000 : remainingMs;

  const handleReset = () => {
    if (isRunning) {
      const ok = window.confirm("Reset the running timer?");
      if (!ok) return;
    }
    reset();
  };

  return (
    <div className="pomodoro-view">
      {/* Active task */}
      <div className="pomodoro-task-row">
        {selectedTaskSnapshot && (
          <div
            className={
              "pomodoro-active-task" +
              (selectedTaskOnBoard ? "" : " pomodoro-active-task--missing")
            }
          >
            <Badge variant={selectedTaskSnapshot.sourceBadgeVariant}>
              {selectedTaskSnapshot.sourceBadge}
            </Badge>
            <span>{selectedTaskSnapshot.title}</span>
            {!selectedTaskOnBoard && <span>(no longer on board)</span>}
            <button
              type="button"
              className="pomodoro-active-task-clear"
              onClick={() => selectTask(null)}
              title="Clear selected task"
              aria-label="Clear selected task"
            >
              <IconX size={14} />
            </button>
          </div>
        )}
        <TaskPicker
          columnTiles={columnTiles}
          selectedItemId={selectedTaskSnapshot?.itemId ?? null}
          onSelect={selectTask}
        />
      </div>

      {/* Timer display */}
      <div className="pomodoro-timer-display">{formatMmSs(displayMs)}</div>
      <div className="pomodoro-phase-label">{phaseLabel(phase)}</div>
      <div className="pomodoro-cycle-indicator">
        Cycle {Math.min(cycleCount + (phase === "work" ? 1 : 0), cyclesBeforeLongBreak)} of{" "}
        {cyclesBeforeLongBreak}
      </div>

      {/* Duration presets */}
      <ButtonGroup className="pomodoro-presets" aria-label="Work duration">
        {workMinutesOptions.map((m) => (
          <Button
            key={m}
            variant={m === workMinutes ? "secondary" : "outline-secondary"}
            size="sm"
            className="pomodoro-preset-btn"
            disabled={isRunning}
            onClick={() => setWorkMinutes(m)}
          >
            {m}m
          </Button>
        ))}
      </ButtonGroup>

      {/* Controls */}
      <div className="pomodoro-controls">
        {isRunning ? (
          <Button variant="primary" size="sm" onClick={pause}>
            <IconPlayerPauseFilled size={14} /> Pause
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={start}>
            <IconPlayerPlayFilled size={14} /> Start
          </Button>
        )}
        <Button variant="outline-secondary" size="sm" onClick={handleReset}>
          <IconRotateClockwise size={14} /> Reset
        </Button>
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={skip}
          disabled={phase === "idle"}
        >
          <IconPlayerTrackNextFilled size={14} /> Skip
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/sabbir.siddiqui/Documents/work/cmp/dev-home && yarn tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify icons exist**

The icons `IconPlayerPlayFilled`, `IconPlayerPauseFilled`, `IconRotateClockwise`, `IconPlayerTrackNextFilled`, `IconX` must be exported by `@tabler/icons-react`. Confirm:
```bash
grep -E "IconPlayerPlayFilled|IconPlayerPauseFilled|IconRotateClockwise|IconPlayerTrackNextFilled|IconX" /Users/sabbir.siddiqui/Documents/work/cmp/dev-home/node_modules/@tabler/icons-react/dist/esm/icons.d.ts 2>/dev/null | head -10
```
Expected: each name appears. If any are missing, substitute the closest available icon (search for `Icon.*Play`, `Icon.*Pause`, `Icon.*Rotate`, `Icon.*Next`, `Icon.*X` in the same file).

- [ ] **Step 4: Commit**

```bash
git add src/views/pomodoro/PomodoroView.tsx
git commit -m "feat(pomodoro): add PomodoroView with task picker and controls"
```

---

## Task 6: Wire into App.tsx

**Files:**
- Modify: `src/App.tsx`

**Dependencies:** Tasks 1, 4, 5.

- [ ] **Step 1: Add imports**

In `src/App.tsx`, add `IconClock` to the existing `@tabler/icons-react` import, and add new imports for the pomodoro pieces.

Find the existing import block at the top (lines 8–23) and add `IconClock` to the list (alphabetical placement is fine):

```ts
import {
  IconCode,
  IconRefresh,
  IconSettings,
  IconPlus,
  IconLayoutDashboard,
  IconColumns3,
  IconNotes,
  IconSubtask,
  IconAt,
  IconGitPullRequest,
  IconEye,
  IconBuilding,
  IconChevronsLeft,
  IconChevronsRight,
  IconClock,
} from "@tabler/icons-react";
```

Then after the existing `import { FindInPage } from "./components/FindInPage";` line, add:

```ts
import { usePomodoro } from "./hooks/usePomodoro";
import { PomodoroView } from "./views/pomodoro/PomodoroView";
import { PomodoroBadge } from "./views/pomodoro/PomodoroBadge";
```

- [ ] **Step 2: Call the hook**

After the existing `const { updateInfo, dismiss: dismissUpdate } = useUpdateCheck();` line (currently line 129), add:

```ts
const pomodoro = usePomodoro({ columnTiles });
```

- [ ] **Step 3: Add the badge to the top bar**

In the top-bar right cluster (currently the `<div className="d-flex align-items-center gap-2 justify-content-end">`), insert the badge BEFORE the `{loading && <Spinner ... />}` line:

```tsx
<div className="d-flex align-items-center gap-2 justify-content-end">
  {pomodoro.phase !== "idle" && (
    <PomodoroBadge
      phase={pomodoro.phase}
      remainingMs={pomodoro.remainingMs}
      taskTitle={pomodoro.selectedTaskSnapshot?.title ?? null}
      onClick={() => setActiveTab("pomodoro")}
    />
  )}
  {loading && <Spinner animation="border" size="sm" variant="secondary" />}
  {/* ...rest unchanged... */}
</div>
```

- [ ] **Step 4: Add the sidebar entry**

In the sidebar `tabs` array (currently starting at line ~187), insert the pomodoro entry between `notes` and `jira`:

```tsx
{
  key: "notes",
  label: "Notes",
  icon: IconNotes,
  count: unresolvedNotes.length,
},
{ key: "pomodoro", label: "Pomodoro", icon: IconClock, count: undefined },
{ key: "jira", label: "JIRA Tasks", icon: IconSubtask, count: jiraIssues.length },
```

- [ ] **Step 5: Add the tab content render**

In the tab content switch (the block of `{effectiveTab === "..." && (...)}` conditionals), add an entry for `pomodoro` — placement near `notes` is fine:

```tsx
{effectiveTab === "pomodoro" && (
  <PomodoroView columnTiles={columnTiles} {...pomodoro} />
)}
```

- [ ] **Step 6: Type-check**

Run: `cd /Users/sabbir.siddiqui/Documents/work/cmp/dev-home && yarn tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Build & lint**

Run: `yarn build && yarn lint`
Expected: both succeed with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(pomodoro): wire pomodoro tab and top-bar badge into App"
```

---

## Task 7: Manual verification

**Files:** none (verification only).

**Dependencies:** Tasks 1–6 all complete.

- [ ] **Step 1: Start dev server**

Run: `cd /Users/sabbir.siddiqui/Documents/work/cmp/dev-home && yarn dev`

Wait for vite to print the dev URL. Open the app in Electron / browser per usual project workflow.

- [ ] **Step 2: Verify sidebar entry**

In the sidebar, confirm a "Pomodoro" tab appears between "Notes" and "JIRA Tasks" with a clock icon. Click it — the Pomodoro view should render with "30:00" displayed (default work minutes), "Ready" phase label, and the four preset buttons 15/20/30/45 with 30 selected.

- [ ] **Step 3: Verify start + badge visibility**

Click the 15m preset, click Start. The display should count down from 15:00 and a `00:14` badge should appear in the top bar. Click the Notes tab — the badge should still be visible. Click the badge — should jump back to Pomodoro tab.

- [ ] **Step 4: Verify pause + reset**

Pause the timer at ~14:50. The countdown should freeze. Resume — countdown continues from where it stopped. Reset (confirm the prompt) — display returns to 30:00 (or whatever preset is selected, but reset goes to idle so display shows `workMinutes * 60_000` which is 15:00 if 15m is still selected). Confirm phase label returns to "Ready" and the top-bar badge disappears.

- [ ] **Step 5: Verify task picker**

Open the "Focus on" dropdown. Confirm tiles from your Kanban board appear grouped by column (Todo / In Progress / On Hold / In Review), and that Done tiles do NOT appear. Select one. Its title + source badge should appear above the timer.

- [ ] **Step 6: Verify "no longer on board" hint**

With a task selected on the Pomodoro tab, switch to the Kanban tab and move the selected task to Done (or resolve a note). Return to Pomodoro — the task display should still show the title but with "(no longer on board)" hint and italicized style.

- [ ] **Step 7: Verify phase-end behavior**

Set work to 15m, click Start. (For faster verification, you may temporarily edit the work minutes constant to 1 minute and revert after.) Let the timer reach 00:00. Expected:
- Bell sound plays (if browser/system audio allowed)
- Native notification fires (if permission granted; first run will prompt)
- Phase advances to "Short break" with 05:00 displayed, paused (button reads "Start")
- Top-bar badge stays visible since phase is no longer idle

- [ ] **Step 8: Verify reload persistence**

While the timer is running, reload the page (Cmd+R). The timer should resume from approximately where it left off (within ~1 second) and the top-bar badge should reappear. Selected task should still be selected.

- [ ] **Step 9: Verify reload-after-completion**

Pause the timer, set `endsAt` to a past time by waiting longer than the remaining duration (or just keep app closed past phase end). On reopen, the phase should have advanced silently (no bell/notification) and be paused.

- [ ] **Step 10: Final commit (if any fixups)**

If verification surfaced bugs, fix them with focused commits referencing the issue. No commit needed if verification clean.

---

## Verification summary

After Task 7, you should have:
- A working Pomodoro tab between Notes and JIRA Tasks
- A top-bar badge visible across all tabs while the timer is non-idle
- Configurable work duration via 15/20/30/45 preset buttons
- Task selection from current Kanban tiles, excluding Done
- "No longer on board" hint when the selected task leaves the active board
- Bell + native Notification on phase end, with auto-advance but paused
- localStorage persistence surviving reloads, including handling for phases that completed while app was closed

No tests are added because the repo has no test infrastructure; verification is manual per spec.
