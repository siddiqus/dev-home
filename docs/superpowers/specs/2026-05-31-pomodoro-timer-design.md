# Pomodoro Timer — Design Spec

**Date:** 2026-05-31
**Status:** Approved for implementation planning

## Goal

Add a Pomodoro focus timer to Dev Home so users can run focused work sessions, optionally pinned to a task pulled from the existing Kanban board. The timer must be visible across all tabs while running.

## Scope

In scope:
- New "Pomodoro" tab in the sidebar (flat, alongside existing tabs)
- Configurable work duration via preset picker (15 / 20 / 30 / 45 min)
- Fixed break durations (5 min short, 15 min long, long break every 4 cycles)
- Task selection from current Kanban tiles (excluding Done)
- Top-bar badge with running mm:ss + active task tooltip, visible on every tab
- Bell sound + native Notification on phase end; auto-advance phase but stay paused until user clicks Start
- `localStorage` persistence of settings + in-progress state

Out of scope (per brainstorm):
- History or stats (today count, weekly counts, etc.)
- Custom-minute input for work duration
- Custom break durations
- Productivity submenu / grouping (will revisit when a second tool is added)

## Architecture

### File layout

Matches existing `src/views/<name>/` convention with co-located CSS, and `src/hooks/` for shared state.

```
src/hooks/usePomodoro.ts
src/views/pomodoro/PomodoroView.tsx
src/views/pomodoro/TaskPicker.tsx
src/views/pomodoro/PomodoroBadge.tsx
src/views/pomodoro/pomodoro.css
public/pomodoro-bell.mp3        (small bundled bell sound)
```

Edits:
- `src/App.tsx` — add hook call, sidebar entry, top-bar badge slot, tab content render

### `usePomodoro` hook

Single source of truth for timer state, lifted in `App.tsx` so both `PomodoroView` and `PomodoroBadge` read the same state.

**State**
- `phase: "idle" | "work" | "shortBreak" | "longBreak"`
- `workMinutes: 15 | 20 | 30 | 45` — default **30**
- `cycleCount: number` — completed work cycles; resets after a long break
- `endsAt: number | null` — wall-clock ms when current running phase ends; null when paused or idle
- `remainingMs: number` — derived from `endsAt - Date.now()` on each tick
- `isRunning: boolean`
- `selectedTaskId: string | null` — `KanbanTile.kanbanItem.item_id` of pinned task
- `selectedTaskSnapshot: { title: string; sourceBadge: string; sourceBadgeVariant: BadgeVariant; url: string } | null` — cached at selection time so the task display survives the tile leaving the board mid-session

**Actions**
- `start()` — sets `endsAt = Date.now() + remainingMs` (or full phase duration if `remainingMs === 0`), `isRunning = true`. If `phase === "idle"`, sets `phase = "work"` first.
- `pause()` — captures `remainingMs` from `endsAt`, clears `endsAt`, `isRunning = false`
- `reset()` — `phase = "idle"`, `cycleCount = 0`, `remainingMs = 0`, `endsAt = null`, `isRunning = false`. Does NOT clear `selectedTaskId` or `workMinutes`.
- `skip()` — advances to next phase (work → short/long break, break → work) leaving it paused. Updates `cycleCount` when completing a work phase.
- `setWorkMinutes(min: 15 | 20 | 30 | 45)` — only effective when `phase === "idle"` or paused at phase start; persists preference.
- `selectTask(tile: KanbanTile | null)` — sets selected task id + snapshot.

**Inputs**
- `columnTiles: KanbanTile[]` — passed in from `App.tsx`. The hook uses this only to refresh `selectedTaskSnapshot` when the underlying tile data updates (e.g. title edit) and to determine whether the selected task is still on the board for the "(no longer on board)" hint.

**Tick mechanism**
- `setInterval(tick, 250)` while `isRunning === true`
- `tick()` computes `remainingMs = Math.max(0, endsAt - Date.now())`. If `remainingMs === 0`, fires end-of-phase behavior.
- Wall-clock based — accurate across renderer throttling and brief system sleep.

**End-of-phase behavior**
1. Play `pomodoro-bell.mp3` via `new Audio("/pomodoro-bell.mp3").play()`
2. Fire `new Notification(title, { body })` — e.g. "Work session complete" / "Time to focus"
3. Set `isRunning = false`, clear `endsAt`
4. Advance `phase`:
   - `work` → if `cycleCount + 1 === cyclesBeforeLongBreak` (4) → `longBreak`, else `shortBreak`. Increment `cycleCount`. If it just became long break, reset `cycleCount` to 0 after the break completes.
   - `shortBreak` → `work`
   - `longBreak` → `work`, `cycleCount = 0`
5. Set `remainingMs` to full duration of the new phase; do not auto-start.

**Persistence**
- `localStorage` keys (consistent with `dev-home-*` prefix):
  - `dev-home-pomodoro-work-minutes` — preferred work duration
  - `dev-home-pomodoro-state` — JSON of `{ phase, cycleCount, endsAt, remainingMs, isRunning, selectedTaskId, selectedTaskSnapshot }`
- On mount, restore state. If `isRunning` was true and `endsAt < Date.now()`, treat as phase completed while app was closed: advance phase, leave paused, do NOT fire bell/notification (avoid surprise on reopen).

**Notification permission**
- On first user-initiated `start()`, if `Notification.permission === "default"`, call `Notification.requestPermission()`. Don't prompt on hook mount — that's intrusive.

### `PomodoroView`

Main tab content. Layout (top to bottom):

1. **Active task display** — if `selectedTaskSnapshot` set: source badge + title, "(no longer on board)" hint if not in current `columnTiles`. Click to clear selection.
2. **Task picker** — dropdown trigger labeled "Focus on: <task title>" or "Focus on: (none)". Opens `TaskPicker`.
3. **Big timer display** — large mm:ss using monospace, phase label below ("Work" / "Short break" / "Long break" / "Ready"), cycle indicator ("Cycle 2 of 4").
4. **Duration presets** — segmented control with buttons "15", "20", "30", "45". Disabled when timer is running. Active button highlighted.
5. **Controls row** — Start/Pause (toggles), Reset, Skip. Reset asks for confirmation only if `isRunning`.

### `TaskPicker`

Props: `columnTiles: KanbanTile[]`, `selectedTaskId: string | null`, `onSelect: (tile: KanbanTile | null) => void`.

- Filters out `column_name === "done"` tiles
- Groups remaining tiles by column in `KANBAN_COLUMNS` order (Todo / In Progress / On Hold / In Review)
- Each entry: `Badge` (using `tile.sourceBadgeVariant`) + `tile.title`
- Top entry: "No specific task" → calls `onSelect(null)`
- Reuses existing `Badge` primitive

### `PomodoroBadge`

Rendered in `App.tsx` top-bar right cluster, before the `<Spinner>`. Visible only when `phase !== "idle"`.

- Displays: `StatusDot` (color by phase: work=warning, breaks=success), mm:ss text
- Tooltip: active task title if set, else "<Phase> · <remaining>"
- onClick: `setActiveTab("pomodoro")`
- Uses tokens for color, no hard-coded hex

### `App.tsx` changes

```tsx
const pomodoro = usePomodoro({ columnTiles });

// Sidebar tabs array — add between "notes" and "jira":
{ key: "pomodoro", label: "Pomodoro", icon: IconClock, count: undefined }

// Top-bar right cluster — before <Spinner>:
{pomodoro.phase !== "idle" && (
  <PomodoroBadge
    phase={pomodoro.phase}
    remainingMs={pomodoro.remainingMs}
    taskTitle={pomodoro.selectedTaskSnapshot?.title ?? null}
    onClick={() => setActiveTab("pomodoro")}
  />
)}

// Tab content switch — add:
{effectiveTab === "pomodoro" && (
  <PomodoroView columnTiles={columnTiles} {...pomodoro} />
)}
```

## Data flow

```
useKanban → columnTiles → App.tsx
                            ├→ usePomodoro({ columnTiles })
                            │     ↑ uses for snapshot refresh + "no longer on board" check
                            ├→ PomodoroView (also receives columnTiles for picker)
                            └→ PomodoroBadge (no tiles, just timer + task snapshot)
```

## Styling

- New `src/views/pomodoro/pomodoro.css` co-located with view, imported via `@import` from `src/styles/index.css` matching existing pattern.
- Use design tokens from `src/styles/tokens.css` — no hard-coded colors. Phase colors map to existing semantic status tokens (work → warning, breaks → success).
- Big timer display: monospace font, sized via `clamp()` so it scales with the tab content area.

## Error handling

- **Audio fails to play** (autoplay policy, missing file) — swallow the error; notification + visual phase change still happen.
- **Notification permission denied** — proceed silently; bell + UI change still happen.
- **Corrupt `localStorage` state JSON** — try/catch the parse; fall back to default state.
- **Selected task disappears from `columnTiles`** — show cached snapshot with "(no longer on board)" hint; don't auto-clear (user might move it back).

## Testing

No test infrastructure currently exists in this repo, so verification is manual:
- Start a 15-min timer, switch tabs, confirm badge stays in top bar
- Let a phase complete, confirm bell + notification + auto-pause at next phase
- Reload during a running phase, confirm state restores correctly
- Reload after `endsAt` has passed, confirm phase advances without firing bell
- Select a Kanban task, move it to Done in the Kanban tab, return to Pomodoro — confirm "(no longer on board)" hint
- Change duration preset while running — confirm buttons are disabled

## Open questions

None. All clarifications resolved during brainstorm:
- Configurable durations via preset (15/20/30/45)
- Top-bar badge + tab view both
- Sound + notification + auto-advance but stay paused
- No history/stats
- Task selection from Kanban, exclude Done
- Flat sidebar entry (defer Productivity submenu until a second tool is added)
